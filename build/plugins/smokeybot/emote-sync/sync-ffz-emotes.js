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
exports.sync_ffz_emotes = exports.cancel_sync = exports.FFZ_emoji_queue_attempt_count = exports.FFZ_emoji_queue_count = exports.EMOJI_COOLDOWN = void 0;
const discord_js_1 = require("discord.js");
const mnemonist_1 = require("mnemonist");
const logger_1 = require("../../../clients/logger");
const queue_1 = require("../../../clients/queue");
const utils_1 = require("../../../utils");
const logger = (0, logger_1.getLogger)('FFZ Emote Manager');
exports.EMOJI_COOLDOWN = new mnemonist_1.LRUCache(25);
exports.FFZ_emoji_queue_count = 0;
exports.FFZ_emoji_queue_attempt_count = 0;
/**
 * Cancel the emote sync for the guild.
 * @param message
 */
function cancel_sync(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const inQueue = queue_1.EmoteQueue.get(interaction.guild.id);
        if (inQueue) {
            queue_1.EmoteQueue.delete(interaction.guild.id);
            inQueue.msg.editReply('Sync cancelled.  You can do another if you wish.');
            logger.debug('Sync cancelled by ' +
                interaction.user.username +
                ' in ' +
                interaction.guild.name);
            interaction.reply({ content: '👍', ephemeral: true });
            return true;
        }
        else {
            return false;
        }
    });
}
exports.cancel_sync = cancel_sync;
/**
 *
 * @param message
 */
function sync_ffz_emotes(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = interaction.options.getString('channel').toLowerCase().trim();
        const userPerms = new discord_js_1.Permissions(interaction.member.permissions);
        if (channel &&
            userPerms.has(discord_js_1.Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS) &&
            !queue_1.EmoteQueue.has(interaction.guild.id)) {
            yield interaction.reply(`Checking FrankerFaceZ API to sync emotes..`);
            logger.debug(`Fetching FFZ Emotes for Twitch channel ${channel} (requested by ${interaction.user.username} in ${interaction.guild.name})..`);
            const ffz_emotes = yield (0, utils_1.jsonFetch)(`https://api.frankerfacez.com/v1/room/${channel}`);
            exports.FFZ_emoji_queue_attempt_count++;
            if (!ffz_emotes || !ffz_emotes.room || !ffz_emotes.room.set) {
                logger.debug(`Couldn't fetch FFZ Emotes for Twitch channel ${channel}.`);
                yield interaction.editReply(`There was an error fetching from FrankerFaceZ's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for FFZ's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`/sync-ffz summit1g\``);
                return;
            }
            else if (ffz_emotes.room.set) {
                const emojis = ffz_emotes.sets[ffz_emotes.room.set].emoticons;
                const existing_emojis = [];
                const final_emojis = [];
                interaction.guild.emojis.cache.forEach((value) => {
                    existing_emojis.push(value.name);
                });
                if (!queue_1.EmoteQueue.has(interaction.guild.id)) {
                    emojis.forEach((element) => {
                        var _a;
                        const emote_url = (_a = ('https:' + element.urls['4'] ||
                            'https:' + element.urls['3'] ||
                            'https:' + element.urls['2'] ||
                            'https:' + element.urls['1'])) !== null && _a !== void 0 ? _a : undefined;
                        if (!existing_emojis.includes(element.name) &&
                            !emote_url.match('undefined') &&
                            emote_url) {
                            final_emojis.push({ url: emote_url, name: element.name });
                        }
                        else {
                            logger.trace('emote already detected, not uploading..');
                        }
                    });
                    if (final_emojis.length > 0) {
                        exports.EMOJI_COOLDOWN.set(interaction.guild.id, Date.now());
                        logger.debug(`Syncing ${final_emojis.length}/${emojis.length} total emotes for ${channel}..`);
                        exports.FFZ_emoji_queue_count++;
                        queue_1.EmoteQueue.set(interaction.guild.id, {
                            emotes: final_emojis,
                            msg: interaction,
                        });
                        yield interaction.editReply(`**Successfully syncing ${final_emojis.length}/${emojis.length} emotes!** \n\n\n It will take up to 30 minutes or more depending on the queue. \n\n Type \`/cancel-sync\` to cancel. \n Type \`/stats\` to see how many servers are in queue.`);
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
exports.sync_ffz_emotes = sync_ffz_emotes;
