"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueMsg = exports.resetQueue = exports.EmoteQueue = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const discord_js_1 = require("discord.js");
const discord_1 = require("./discord");
const logger_1 = require("./logger");
const logger = (0, logger_1.getLogger)('Queue');
exports.EmoteQueue = new discord_js_1.Collection();
const EMOTE_COOLDOWN = 35 * 1000;
const MSG_COOLDOWN = 10 * 1000;
const MsgQueue = [];
let timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
let timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
/**
 * Reset and clear a queue.
 * @param queue 'emote' or 'message' queues.
 */
function resetQueue(queue = 'emote', message) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (queue) {
            case 'emote':
                clearTimeout(timerEmoteQ);
                exports.EmoteQueue.clear();
                timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
                yield message.reply('Successfully reset emote queue.');
                logger.error('Reset emote queue.');
                break;
            case 'message':
                clearTimeout(timerMsgQ);
                exports.EmoteQueue.clear();
                timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
                yield message.reply('Successfully reset message queue.');
                logger.error('Reset message queue.');
                break;
        }
    });
}
exports.resetQueue = resetQueue;
/**
 * Add a message to the message queue.
 * @param outgoingMsg String or Embed
 * @param msg Message to use for data.
 * @param reply Are we replying to the user?
 * @param priority `0` = Low, `1` = High
 * @param spawn Spawn channel. If undefined it won't send to a spawn channel.
 * @returns `TRUE` if added to the queue.
 */
function queueMsg(outgoingMsg, msg, reply = false, priority = 0, spawn, embed) {
    if (outgoingMsg.toString().length >= 2000)
        return false;
    switch (priority) {
        // low priority
        case 0:
            MsgQueue.push({
                outgoingMsg: outgoingMsg,
                msg: msg,
                reply: reply,
                spawn: spawn,
                embed: embed,
            });
            return true;
        // high priority
        case 1:
            MsgQueue.unshift({
                outgoingMsg: outgoingMsg,
                msg: msg,
                reply: reply,
                spawn: spawn,
                embed: embed,
            });
            return true;
        // low priority
        default:
            MsgQueue.push({
                outgoingMsg: outgoingMsg,
                msg: msg,
                reply: reply,
                spawn: spawn,
                embed: embed,
            });
            return true;
    }
}
exports.queueMsg = queueMsg;
/**
 * Repeating timed function to run the message queue.
 */
function runMsgQueue() {
    if (MsgQueue.length > 0 && !discord_1.rateLimited) {
        const object = MsgQueue.shift();
        if (!object)
            return;
        try {
            if (!object.reply && !object.spawn) {
                object.msg.channel.send(object.outgoingMsg).then(() => {
                    var _a;
                    try {
                        logger.trace(`Sent a message in ${(_a = object.msg.guild) === null || _a === void 0 ? void 0 : _a.name}.`);
                    }
                    catch (error) {
                        logger.error(error);
                        timerMsgQ = setTimeout(runMsgQueue, 250);
                    }
                });
            }
            else if (!object.reply && object.spawn && object.embed) {
                object.spawn.send({ embeds: [object.outgoingMsg] });
            }
            else if (!object.reply && object.spawn) {
                object.spawn.send(object.outgoingMsg);
            }
            else {
                object.msg.reply(object.outgoingMsg).then(() => {
                    var _a;
                    try {
                        logger.trace(`Sent a reply to ${object.msg.author.username} in ${(_a = object.msg.guild) === null || _a === void 0 ? void 0 : _a.name}.`);
                    }
                    catch (error) {
                        timerMsgQ = setTimeout(runMsgQueue, 250);
                        logger.error(error);
                    }
                });
            }
            timerMsgQ = setTimeout(runMsgQueue, 250);
        }
        catch (error) {
            logger.error(error);
            timerMsgQ = setTimeout(runMsgQueue, 250);
        }
    }
    else {
        if (discord_1.rateLimited) {
            timerMsgQ = setTimeout(runMsgQueue, 10000);
        }
        else {
            timerMsgQ = setTimeout(runMsgQueue, 100);
        }
    }
}
/**
 * Repeating timed function to run the emote upload queue.
 */
function runEmoteQueue() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        if (exports.EmoteQueue.first() && !discord_1.rateLimited) {
            const object = exports.EmoteQueue.first();
            const emote = (_b = (_a = object.emotes) === null || _a === void 0 ? void 0 : _a.shift()) !== null && _b !== void 0 ? _b : null;
            const message = object.msg;
            exports.EmoteQueue.set(message.guild.id, object);
            if (emote) {
                logger.trace(`Attempting to create emoji '${emote.name}' on ${message.guild.name}.`);
                create_emoji(emote.url, message, emote.name);
                timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
            }
            else {
                const temp = exports.EmoteQueue.first();
                logger.debug(`Successfully finished queue for ${temp.msg.guild.name}.`);
                exports.EmoteQueue.delete(exports.EmoteQueue.firstKey());
                timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
            }
        }
        else {
            timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
        }
    });
}
/**
 * Function to create an emoji in a Discord server.
 * @param emote_url Emote URL (256kb limit)
 * @param message Discord Message Object
 * @param name String
 * @returns true/false
 */
function create_emoji(emote_url, message, name) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (yield message.guild.emojis.create(emote_url, name).then((emoji) => __awaiter(this, void 0, void 0, function* () {
                logger.debug(`Created new emoji with name ${emoji.name} in ${emoji.guild.name}.`);
                return true;
            }))) {
                return true;
            }
            else {
                return false;
            }
        }
        catch (err) {
            switch (err.message) {
                case 'Maximum number of emojis reached (50)':
                case 'Maximum number of emojis reached (75)':
                case 'Maximum number of emojis reached (100)':
                case 'Maximum number of emojis reached (250)':
                    exports.EmoteQueue.delete(message.guild.id);
                    logger.info(`Maximum emojis reached for server '${message.guild.name}'.`);
                    yield message.reply(`you've reached the maximum amount of emotes for the server.`);
                    return false;
                case 'Missing Permissions':
                    exports.EmoteQueue.delete(message.guild.id);
                    logger.info(`Improper permissions for server '${message.guild.name}'.`);
                    yield message.reply(`SmokeyBot doesn't have the proper permissions. Make sure SmokeyBot can Manage Emoji in the roles section.`);
                    return false;
                default:
                    logger.error(`'${err.message.trim().replace('\n', '')}'`);
                    return false;
            }
        }
    });
}
