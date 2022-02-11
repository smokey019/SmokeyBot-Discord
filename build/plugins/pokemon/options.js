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
exports.toggleSmokeMon = void 0;
const discord_js_1 = require("discord.js");
const cache_1 = require("../../clients/cache");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const queue_1 = require("../../clients/queue");
const logger = (0, logger_1.getLogger)('Pokémon');
function toggleSmokeMon(interaction, cache) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const userPerms = new discord_js_1.Permissions(interaction.member.permissions);
        const toggle = interaction.options.getBoolean('toggle');
        if (!userPerms.has(discord_js_1.Permissions.FLAGS.ADMINISTRATOR))
            return;
        if (toggle) {
            const monsterChannel = (_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.channels.cache.find((ch) => ch.name === cache.settings.specific_channel);
            if (!monsterChannel) {
                (0, queue_1.queueMsg)(`You cannot enable smokeMon unless you have a channel called \`pokémon-spawns\` (with the special é). Make sure SmokeyBot has access to read/write in this channel as well.`, interaction, true, 1);
                return;
            }
            const updateGuild = yield (0, database_1.databaseClient)(database_1.GuildSettingsTable)
                .where({ guild_id: interaction.guild.id })
                .update({ smokemon_enabled: 1 });
            if (updateGuild) {
                logger.info(`SmokeMon enabled in ${interaction.guild.name} | ${interaction.guild.id}.`);
                (0, queue_1.queueMsg)('smokeMon enabled! This plugin is for fun and SmokeyBot does not own the rights to any images/data and images/data are copyrighted by the Pokémon Company and its affiliates.', interaction, true, 1);
                cache.settings.smokemon_enabled = 1;
                if (interaction.guild) {
                    cache_1.cacheClient.set(interaction.guild.id, cache);
                }
                return true;
            }
            else {
                logger.error(`Couldn't update settings for guild ${interaction.guild.name} - ${interaction.guild.id}.`);
                return false;
            }
        }
        else {
            const updateGuild = yield (0, database_1.databaseClient)(database_1.GuildSettingsTable)
                .where({ guild_id: interaction.guild.id })
                .update({ smokemon_enabled: 0 });
            if (updateGuild) {
                logger.info(`smokeMon disabled in ${interaction.guild.name} | ${interaction.guild.id}.`);
                (0, queue_1.queueMsg)('smokeMon disabled!', interaction, true, 1);
                cache.settings.smokemon_enabled = 0;
                if (interaction.guild) {
                    cache_1.cacheClient.set(interaction.guild.id, cache);
                }
                return true;
            }
        }
    });
}
exports.toggleSmokeMon = toggleSmokeMon;
