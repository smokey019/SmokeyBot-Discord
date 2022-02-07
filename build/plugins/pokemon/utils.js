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
exports.img_monster_ball = exports.getBotStats = exports.checkServerWeather = exports.voteCommand = exports.rollPerfectIV = exports.rollShiny = exports.rollGender = exports.rollLevel = exports.parseArgs = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const discord_js_1 = require("discord.js");
const cache_1 = require("../../clients/cache");
const database_1 = require("../../clients/database");
const discord_1 = require("../../clients/discord");
const queue_1 = require("../../clients/queue");
const top_gg_1 = require("../../clients/top.gg");
const colors_1 = require("../../colors");
const utils_1 = require("../../utils");
const sync_7tv_emotes_1 = require("../smokeybot/emote-sync/sync-7tv-emotes");
const sync_ffz_emotes_1 = require("../smokeybot/emote-sync/sync-ffz-emotes");
const monsters_1 = require("./monsters");
const weather_1 = require("./weather");
// const SHINY_ODDS_RETAIL = parseInt(getConfigValue('SHINY_ODDS_RETAIL'));
// const SHINY_ODDS_COMMUNITY = parseInt(getConfigValue('SHINY_ODDS_COMMUNITY'));
function parseArgs(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const isQuote = false;
        const sort = ['id', 'high'];
        let search = undefined;
        let page = 0;
        if (!isNaN(parseInt(args[args.length - 1]))) {
            page = parseInt(args[args.length - 1]);
            args.splice(args.length - 1, 1);
            search = args.join(' ');
        }
        else if (args.length >= 2 && isNaN(parseInt(args[args.length - 1]))) {
            page = 0;
            search = args.join(' ');
        }
        else {
            search = args.join(' ');
        }
        return {
            search: search,
            page: page,
            sort: sort,
            isQuote: isQuote,
            args: args,
        };
    });
}
exports.parseArgs = parseArgs;
/**
 * Returns a randomized level.
 */
function rollLevel(min, max) {
    return (0, utils_1.getRndInteger)(min, max);
}
exports.rollLevel = rollLevel;
/**
 *
 * @returns Gender in M or F
 */
function rollGender() {
    const genders = ['M', 'F'];
    return genders[(0, utils_1.getRndInteger)(0, 1)];
}
exports.rollGender = rollGender;
/**
 * Returns a randomized value for if an item is shiny. (1 is shiny, 0 is not)
 */
function rollShiny() {
    return (0, utils_1.getRndInteger)(1, 40) >= 40 ? 1 : 0;
}
exports.rollShiny = rollShiny;
function rollPerfectIV() {
    return (0, utils_1.getRndInteger)(1, 45) >= 45 ? 1 : 0;
}
exports.rollPerfectIV = rollPerfectIV;
function voteCommand(interaction) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const voted = (_a = (yield top_gg_1.dblCache.get(interaction.user.id))) !== null && _a !== void 0 ? _a : { voted: false };
        if (!voted.voted) {
            (0, queue_1.queueMsg)(`You haven't voted yet -- vote here and get free stuff for the Pokémon plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`, interaction, true);
        }
        else {
            (0, queue_1.queueMsg)(`You've already voted, but maybe others want to vote here and get free stuff for the Pokémon plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`, interaction, true);
        }
    });
}
exports.voteCommand = voteCommand;
function checkServerWeather(interaction, cache) {
    return __awaiter(this, void 0, void 0, function* () {
        const boost = yield (0, weather_1.getBoostedWeatherSpawns)(interaction, cache);
        (0, queue_1.queueMsg)(`The current weather is **${boost.weather}**.  You will find increased spawns of **${boost.boosts.join(' / ')}** on this server.`, interaction, true);
    });
}
exports.checkServerWeather = checkServerWeather;
function getBotStats(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        cache_1.GLOBAL_COOLDOWN.set(interaction.guild.id, (0, utils_1.getCurrentTime)());
        const ping = Date.now() - interaction.createdTimestamp;
        const embed = new discord_js_1.MessageEmbed()
            .setColor(colors_1.COLOR_BLUE)
            .setTitle('SmokeyBot Statistics 📊')
            .addField('Ping 🌩️', ping + ' ms', true)
            .addField('Servers in Emote Queue 🔗', (0, utils_1.format_number)(queue_1.EmoteQueue.size), true)
            .addField('Emote Synchronizations 🔼', `${(0, utils_1.format_number)(sync_7tv_emotes_1.Stv_emoji_queue_count + sync_ffz_emotes_1.FFZ_emoji_queue_count)} / ${(0, utils_1.format_number)(sync_7tv_emotes_1.Stv_emoji_queue_attempt_count + sync_ffz_emotes_1.FFZ_emoji_queue_attempt_count)}`, true)
            .addField('Total Servers 🖥️', (0, utils_1.format_number)(discord_1.discordClient.guilds.cache.size), true)
            .addField('Total ' + (0, utils_1.theWord)() + ' 🐾', (0, utils_1.format_number)(yield (0, monsters_1.getMonsterDBCount)()), true)
            .addField('Total Shiny ' + (0, utils_1.theWord)() + ' 🌟', (0, utils_1.format_number)(yield (0, monsters_1.getShinyMonsterDBCount)()), true)
            .addField('Total ' + (0, utils_1.theWord)() + ' Users 👤', (0, utils_1.format_number)(yield (0, database_1.getUserDBCount)()), true)
            .setTimestamp();
        yield interaction.reply({ embeds: [embed] });
    });
}
exports.getBotStats = getBotStats;
exports.img_monster_ball = `https://cdn.discordapp.com/attachments/550103813587992586/721256683665621092/pokeball2.png`;
