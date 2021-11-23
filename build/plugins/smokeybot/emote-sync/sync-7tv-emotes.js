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
exports.sync_7tv_emotes = exports.fetch7tvChannelEmotes = exports.fetch7tvGlobalEmotes = void 0;
const discord_js_1 = require("discord.js");
const log4js_1 = require("log4js");
const queue_1 = require("../../../clients/queue");
const utils_1 = require("../../../utils");
const sync_ffz_emotes_1 = require("./sync-ffz-emotes");
const logger = (0, log4js_1.getLogger)('7TV Emote Manager');
/**
 * Fetch 7TV Global Emotes
 * @returns Array of 7TV Global Emotes.
 */
function fetch7tvGlobalEmotes() {
    return __awaiter(this, void 0, void 0, function* () {
        const emotes = yield (0, utils_1.jsonFetch)('https://api.7tv.app/v2/emotes/global');
        return emotes;
    });
}
exports.fetch7tvGlobalEmotes = fetch7tvGlobalEmotes;
/**
 * Fetch 7TV Channel Emotes
 * @param channel Twitch Login
 * @returns Array of 7TV Channel Emotes.
 */
function fetch7tvChannelEmotes(channel) {
    return __awaiter(this, void 0, void 0, function* () {
        const emotes = yield (0, utils_1.jsonFetch)(`https://api.7tv.app/v2/users/${channel}/emotes`);
        return emotes;
    });
}
exports.fetch7tvChannelEmotes = fetch7tvChannelEmotes;
/**
 *
 * @param message
 */
function sync_7tv_emotes(message) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let embed = undefined;
        let to_be_deleted = undefined;
        const args = message.content
            .slice(1)
            .trim()
            .toLowerCase()
            .replace(/ {2,}/gm, ' ')
            .split(/ +/);
        const command = args.shift();
        const channel = (_a = args[0]) === null || _a === void 0 ? void 0 : _a.replace(/\W/g, '');
        if (command == 'sync-emotes-7tv' &&
            channel &&
            message.member.permissions.has([
                discord_js_1.Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS,
            ]) &&
            !queue_1.EmoteQueue.has(message.guild.id)) {
            embed = new discord_js_1.MessageEmbed()
                .setTitle('7TV Emote Manager')
                .setColor(0xff0000)
                .setDescription(`Checking 7TV API to sync emotes..`);
            yield message.channel
                .send({ embeds: [embed] })
                .then((message) => {
                to_be_deleted = message.id;
            })
                .catch((error) => logger.error(error));
            logger.debug(`Fetching 7TV Emotes for Twitch channel ${channel} (requested by ${message.member.displayName} in ${message.guild.name})..`);
            let emotes;
            if (channel == 'global') {
                emotes = yield fetch7tvGlobalEmotes();
            }
            else {
                emotes = yield fetch7tvChannelEmotes(channel);
            }
            if (!emotes) {
                logger.debug(`Couldn't fetch 7TV Emotes for Twitch channel ${channel}.`);
                yield message.channel.messages
                    .fetch(to_be_deleted)
                    .then((message) => {
                    message.delete();
                })
                    .catch((error) => logger.error(error));
                embed = new discord_js_1.MessageEmbed()
                    .setTitle('7TV Emote Manager')
                    .setColor(0xff0000)
                    .setDescription(`There was an error fetching from 7TV's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for 7TV's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`~sync-emotes-7tv summit1g\``);
                yield message.channel.send({ embeds: [embed] });
                return;
            }
            else {
                const existing_emojis = [];
                const final_emojis = [];
                message.guild.emojis.cache.forEach((value) => {
                    existing_emojis.push(value.name);
                });
                if (!queue_1.EmoteQueue.has(message.guild.id)) {
                    emotes.forEach((element) => {
                        var _a;
                        let emote_url = (_a = (element.urls['4'] ||
                            element.urls['3'] ||
                            element.urls['2'] ||
                            element.urls['1'])) !== null && _a !== void 0 ? _a : undefined;
                        if (element.mime.match('gif')) {
                            emote_url = element.urls['2'];
                        }
                        if (!existing_emojis.includes(element.name) && emote_url[1]) {
                            final_emojis.push({ url: emote_url[1], name: element.name });
                        }
                        else {
                            logger.trace('emote already detected, not uploading..');
                        }
                    });
                    if (final_emojis.length > 0) {
                        sync_ffz_emotes_1.EMOJI_COOLDOWN.set(message.guild.id, Date.now());
                        logger.debug(`Syncing ${final_emojis.length}/${emotes.length} total emotes for ${channel}..`);
                        queue_1.EmoteQueue.set(message.guild.id, {
                            emotes: final_emojis,
                            msg: message,
                        });
                        yield message.channel.messages
                            .fetch(to_be_deleted)
                            .then((message) => {
                            message.delete();
                        })
                            .catch((error) => logger.error(error));
                        embed = new discord_js_1.MessageEmbed()
                            .setTitle('7TV Emote Manager')
                            .setColor(0x00bc8c)
                            .setDescription(`**Successfully syncing ${final_emojis.length}/${emotes.length} emotes!** \n\n\n It will take up to 30 minutes or more depending on the queue. \n\n- Discord's maximum GIF size is 256 kb so some longer emotes may not get uploaded. \n- Some images may not upload as GIFs for some unknown reason. \n\n Type \`~cancel-sync\` to cancel. \n Type \`~stats\` to see how many servers are in queue.`);
                        yield message.channel.send({ embeds: [embed] });
                    }
                    else {
                        logger.debug(`No emotes found able to be synced for ${channel}..`);
                        yield message.channel.messages
                            .fetch(to_be_deleted)
                            .then((message) => {
                            message.delete();
                        })
                            .catch((error) => logger.error(error));
                        embed = new discord_js_1.MessageEmbed()
                            .setTitle('7TV Emote Manager')
                            .setColor(0x00bc8c)
                            .setDescription(`No emotes found to sync. If the emote name(s) already exist they will not be overridden.`);
                        yield message.channel.send({ embeds: [embed] });
                    }
                }
                else {
                    logger.debug(`Error syncing emotes for ${channel}..`);
                    const currentQueue = queue_1.EmoteQueue.get(message.guild.id);
                    const emotes = currentQueue.emotes.length;
                    yield message.channel.messages
                        .fetch(to_be_deleted)
                        .then((message) => {
                        message.delete();
                    })
                        .catch((error) => logger.error(error));
                    embed = new discord_js_1.MessageEmbed()
                        .setTitle('7TV Emote Manager')
                        .setColor(0x00bc8c)
                        .setDescription(`**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`);
                    yield message.channel.send({ embeds: [embed] });
                }
            }
        }
        else if (queue_1.EmoteQueue.has(message.guild.id)) {
            logger.debug(`Error syncing emotes for ${channel}.. They are already in queue.`);
            const currentQueue = queue_1.EmoteQueue.get(message.guild.id);
            const emotes = currentQueue.emotes.length;
            embed = new discord_js_1.MessageEmbed()
                .setTitle('7TV Emote Manager')
                .setColor(0x00bc8c)
                .setDescription(`**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`);
            yield message.channel.send({ embeds: [embed] });
        }
    });
}
exports.sync_7tv_emotes = sync_7tv_emotes;
