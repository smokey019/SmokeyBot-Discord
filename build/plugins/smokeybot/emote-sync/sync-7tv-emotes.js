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
exports.sync_7tv_emotes = exports.fetch7tvChannelEmotes = exports.fetch7tvGlobalEmotes = exports.Stv_emoji_queue_attempt_count = exports.Stv_emoji_queue_count = void 0;
const discord_js_1 = require("discord.js");
const log4js_1 = require("log4js");
const queue_1 = require("../../../clients/queue");
const utils_1 = require("../../../utils");
const sync_ffz_emotes_1 = require("./sync-ffz-emotes");
const logger = (0, log4js_1.getLogger)('7TV Emote Manager');
exports.Stv_emoji_queue_count = 0;
exports.Stv_emoji_queue_attempt_count = 0;
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
        exports.Stv_emoji_queue_attempt_count++;
        return emotes;
    });
}
exports.fetch7tvChannelEmotes = fetch7tvChannelEmotes;
/**
 *
 * @param message
 */
function sync_7tv_emotes(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = interaction.options.getString('channel').toLowerCase().trim();
        const userPerms = new discord_js_1.Permissions(interaction.member.permissions);
        if (channel &&
            userPerms.has(discord_js_1.Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS) &&
            !queue_1.EmoteQueue.has(interaction.guild.id)) {
            yield interaction.reply(`Checking 7TV API to sync emotes..`);
            logger.debug(`Fetching 7TV Emotes for Twitch channel ${channel} (requested by ${interaction.user.username} in ${interaction.guild.name})..`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let emotes;
            if (channel == 'global') {
                emotes = yield fetch7tvGlobalEmotes();
            }
            else {
                emotes = yield fetch7tvChannelEmotes(channel);
            }
            if (!emotes || emotes.status === 404) {
                logger.debug(`Couldn't fetch 7TV Emotes for Twitch channel ${channel}.`);
                yield interaction.editReply(`There was an error fetching from 7TV's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for 7TV's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`/sync-7tv summit1g\``);
                return;
            }
            else {
                const existing_emojis = [];
                const final_emojis = [];
                interaction.guild.emojis.cache.forEach((value) => {
                    existing_emojis.push(value.name);
                });
                if (!queue_1.EmoteQueue.has(interaction.guild.id)) {
                    emotes.forEach((element) => {
                        var _a;
                        /*if (element.mime === 'image/webp' || element.mime.match('gif'))
                          return;*/
                        let emote_url = 
                        // element.urls['4'] ||
                        (_a = (element.urls['3'][1] || element.urls['2'][1] || element.urls['1'][1])) !== null && _a !== void 0 ? _a : undefined;
                        if (element.mime.match('image/webp') && element.urls['2']) {
                            emote_url = element.urls['1'][1].replace('webp', 'gif');
                        }
                        if (!existing_emojis.includes(element.name) && emote_url) {
                            final_emojis.push({ url: emote_url, name: element.name });
                        }
                        else {
                            logger.trace('emote already detected, not uploading..');
                        }
                    });
                    if (final_emojis.length > 0) {
                        sync_ffz_emotes_1.EMOJI_COOLDOWN.set(interaction.guild.id, Date.now());
                        logger.debug(`Syncing ${final_emojis.length}/${emotes.length} total emotes for ${channel}..`);
                        exports.Stv_emoji_queue_count++;
                        queue_1.EmoteQueue.set(interaction.guild.id, {
                            emotes: final_emojis,
                            msg: interaction,
                        });
                        yield interaction.editReply(`**Successfully syncing ${final_emojis.length}/${emotes.length} emotes!**\n\n\nIt will take up to 30 minutes or more depending on the queue.\n\n- Wide emotes will look weird.\n- Certain GIFs that are too long may not upload.\n\n Type \`/cancel-sync\` to cancel. \n Type \`/stats\` to see how many servers are in queue.`);
                    }
                    else {
                        logger.debug(`No emotes found able to be synced for ${channel}..`);
                        yield interaction.editReply(`No emotes found to sync. If the emote name(s) already exist they will not be overridden.`);
                    }
                }
                else {
                    logger.debug(`Error syncing emotes for ${channel}..`);
                    const currentQueue = queue_1.EmoteQueue.get(interaction.guild.id);
                    const emotes = currentQueue.emotes.length;
                    yield interaction.editReply(`**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`);
                }
            }
        }
        else if (queue_1.EmoteQueue.has(interaction.guild.id)) {
            logger.debug(`Error syncing emotes for ${channel}.. They are already in queue.`);
            const currentQueue = queue_1.EmoteQueue.get(interaction.guild.id);
            const emotes = currentQueue.emotes.length;
            yield interaction.editReply(`**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`);
        }
    });
}
exports.sync_7tv_emotes = sync_7tv_emotes;
