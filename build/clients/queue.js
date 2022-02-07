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
exports.queueMsg = exports.resetQueue = exports.last_message = exports.EmoteQueue = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const discord_js_1 = require("discord.js");
const discord_1 = require("./discord");
const logger_1 = require("./logger");
const logger = (0, logger_1.getLogger)('Queue');
exports.EmoteQueue = new discord_js_1.Collection();
const EMOTE_COOLDOWN = 30 * 1000;
const MSG_COOLDOWN = 1.5 * 1000;
exports.last_message = undefined;
const MsgQueue = [];
let timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
let timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
/**
 * Reset and clear a queue.
 * @param queue 'emote' or 'message' queues.
 */
function resetQueue(queue = 'emote', interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (queue) {
            case 'emote':
                clearTimeout(timerEmoteQ);
                exports.EmoteQueue.clear();
                timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
                yield interaction.reply('Successfully reset emote queue.');
                logger.error('Reset emote queue.');
                break;
            case 'message':
                clearTimeout(timerMsgQ);
                exports.EmoteQueue.clear();
                timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
                yield interaction.reply('Successfully reset message queue.');
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
 * @param embed true/false
 * @returns `TRUE` if added to the queue.
 */
function queueMsg(outgoingMsg, msg, reply = false, priority = 0, spawn, embed) {
    if (outgoingMsg.toString().length >= 2000 ||
        !outgoingMsg ||
        outgoingMsg == exports.last_message)
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
    return __awaiter(this, void 0, void 0, function* () {
        if (MsgQueue.length > 0 && !discord_1.rateLimited) {
            const object = MsgQueue.shift();
            if (!object) {
                timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
                return;
            }
            else {
                try {
                    if (!object.reply && !object.spawn && !object.embed) {
                        object.msg.channel.send(object.outgoingMsg).then(() => {
                            var _a;
                            try {
                                logger.debug(`Sent a message in ${(_a = object.msg.guild) === null || _a === void 0 ? void 0 : _a.name}.`);
                                exports.last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
                            }
                            catch (error) {
                                logger.error(error);
                                timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
                            }
                        });
                    }
                    else if (!object.reply && object.spawn && object.embed) {
                        object.spawn.send({ embeds: [object.outgoingMsg] });
                        exports.last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
                    }
                    else if (!object.reply && !object.spawn && object.embed) {
                        object.msg.channel.send({ embeds: [object.outgoingMsg] });
                        exports.last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
                    }
                    else if (object.reply && !object.spawn && object.embed) {
                        object.msg.reply({ embeds: [object.outgoingMsg] });
                        exports.last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
                    }
                    else if (!object.reply && object.spawn) {
                        object.spawn.send(object.outgoingMsg);
                        exports.last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
                    }
                    else {
                        yield object.msg.reply(object.outgoingMsg);
                    }
                    timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
                }
                catch (error) {
                    logger.error(error);
                    timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
                }
            }
        }
        else {
            if (discord_1.rateLimited) {
                timerMsgQ = setTimeout(runMsgQueue, 10000);
            }
            else {
                timerMsgQ = setTimeout(runMsgQueue, 500);
            }
        }
    });
}
/**
 * Repeating timed function to run the emote upload queue.
 */
function runEmoteQueue() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const object = exports.EmoteQueue.first();
            if (object && !discord_1.rateLimited) {
                const emote = (_b = (_a = object.emotes) === null || _a === void 0 ? void 0 : _a.shift()) !== null && _b !== void 0 ? _b : null;
                exports.EmoteQueue.set(object.msg.guild.id, object);
                if (emote) {
                    logger.trace(`Attempting to create emoji '${emote.name}' on ${object.msg.guild.name}.`);
                    create_emoji(emote.url, object.msg, emote.name);
                    timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
                }
                else {
                    const temp = exports.EmoteQueue.first();
                    logger.debug(`Successfully finished queue for ${temp.msg.guild.name}.`);
                    temp.msg.editReply('Finished uploading emotes. You can sync again whenever you want.');
                    exports.EmoteQueue.delete(exports.EmoteQueue.firstKey());
                    timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
                }
            }
            else {
                timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
            }
        }
        catch (error) {
            console.error('Emote Queue Error:', error);
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
function create_emoji(emote_url, interaction, name) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (yield interaction.guild.emojis
                .create(emote_url, name)
                .then((emoji) => __awaiter(this, void 0, void 0, function* () {
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
                    exports.EmoteQueue.delete(interaction.guild.id);
                    logger.info(`Maximum emojis reached for server '${interaction.guild.name}'.`);
                    queueMsg(`You've reached the maximum amount of emotes for the server.`, interaction, true, 1);
                    return false;
                case 'Missing Permissions':
                    exports.EmoteQueue.delete(interaction.guild.id);
                    logger.info(`Improper permissions for server '${interaction.guild.name}'.`);
                    queueMsg(`SmokeyBot doesn't have the proper permissions. Make sure SmokeyBot can Manage Emoji in the roles section.`, interaction, true, 1);
                    return false;
                default:
                    logger.error(`'${err.interaction.trim().replace('\n', '')}'`);
                    return false;
            }
        }
    });
}
