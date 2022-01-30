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
exports.discordClient = exports.initializing = exports.rateLimited = void 0;
const discord_js_1 = require("discord.js");
const commands_1 = require("../plugins/commands");
const exp_gain_1 = require("../plugins/pokemon/exp-gain");
const monsters_1 = require("../plugins/pokemon/monsters");
const parser_1 = require("../plugins/pokemon/parser");
const spawn_monster_1 = require("../plugins/pokemon/spawn-monster");
const utils_1 = require("../utils");
const cache_1 = require("./cache");
const database_1 = require("./database");
const logger_1 = require("./logger");
const queue_1 = require("./queue");
const top_gg_1 = require("./top.gg");
const logger = (0, logger_1.getLogger)('DiscordClient');
exports.rateLimited = false;
exports.initializing = true;
exports.discordClient = new discord_js_1.Client({
    intents: [
        discord_js_1.Intents.FLAGS.GUILDS,
        discord_js_1.Intents.FLAGS.GUILD_MESSAGES,
        discord_js_1.Intents.FLAGS.DIRECT_MESSAGES,
        discord_js_1.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
    ],
    shards: 'auto',
});
exports.discordClient.on('ready', () => __awaiter(void 0, void 0, void 0, function* () {
    logger.info(`Total MonsterPool: ${(0, monsters_1.getAllMonsters)().length}.`);
    logger.info(`Total Monsters: ${monsters_1.MonsterDex.size}.`);
    logger.info('Fully initialized.');
    exports.initializing = false;
    yield (0, top_gg_1.enableAP)();
    yield (0, commands_1.loadCommands)();
}));
exports.discordClient.on('rateLimit', (error) => {
    const timeoutStr = error.timeout / 1000;
    logger.warn(`Rate Limited.. waiting ${(0, utils_1.format_number)(Math.round(timeoutStr / 60))} minutes.`);
    console.log(`Last Message:`, queue_1.last_message);
    exports.rateLimited = true;
    setTimeout(() => {
        logger.warn('Rate limit timeout elapsed.');
        exports.rateLimited = false;
    }, error.timeout);
});
exports.discordClient.on('shardError', (error) => {
    console.error('A websocket connection encountered an error:', error);
});
exports.discordClient.on('error', (error) => {
    console.error('Discord Client Error:', error);
});
exports.discordClient.on('shardReady', (id) => {
    console.error(`Shard ${id} is ready.`);
});
exports.discordClient.on('messageCreate', (message) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield parseMessage(message);
    }
    catch (error) {
        logger.error(error);
    }
}));
function parseMessage(message) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        if (!message.guild ||
            !message.member ||
            message.member.user.username == 'smokeybot' ||
            message.author.bot ||
            exports.rateLimited)
            return;
        const GCD = yield (0, cache_1.getGCD)(message.guild.id);
        const timestamp = (0, utils_1.getCurrentTime)();
        const load_prefixes = yield (0, parser_1.getPrefixes)(message.guild.id);
        const prefixes = RegExp(load_prefixes.join('|'));
        const detect_prefix = message.content.match(prefixes);
        const settings = yield (0, database_1.getGuildSettings)(message);
        const cache = yield (0, cache_1.getCache)(message, settings);
        if (cache && settings) {
            if (cache.settings.smokemon_enabled) {
                yield (0, exp_gain_1.checkExpGain)(message);
                yield (0, spawn_monster_1.checkSpawn)(message, cache);
            }
        }
        const prefix = detect_prefix === null || detect_prefix === void 0 ? void 0 : detect_prefix.shift();
        const args = message.content
            .slice(prefix === null || prefix === void 0 ? void 0 : prefix.length)
            .trim()
            .toLowerCase()
            .replace(/ {2,}/gm, ' ')
            .split(/ +/);
        if (args.length < 1 || !detect_prefix || timestamp - GCD < 2)
            return;
        const command = (_a = args.shift()) !== null && _a !== void 0 ? _a : undefined;
        const commandFile = commands_1.commands.find((_r, n) => n.includes(command));
        if (!commandFile)
            return;
        else
            commandFile({
                message,
                args,
                client: exports.discordClient,
                dev: true,
                settings: settings,
                cache: cache,
            });
    });
}
