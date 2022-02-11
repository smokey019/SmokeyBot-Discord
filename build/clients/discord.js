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
const rest_1 = require("@discordjs/rest");
const v9_1 = require("discord-api-types/v9");
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const commands_1 = require("../plugins/commands");
const exp_gain_1 = require("../plugins/pokemon/exp-gain");
const monsters_1 = require("../plugins/pokemon/monsters");
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
        discord_js_1.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS /*
        Intents.FLAGS.GUILD_PRESENCES*/,
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
    setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, commands_1.registerSlashCommands)();
    }), 15 * 1000);
}));
exports.discordClient.on('interactionCreate', (interaction) => __awaiter(void 0, void 0, void 0, function* () {
    const GCD = yield (0, cache_1.getGCD)(interaction.guild.id);
    const timestamp = (0, utils_1.getCurrentTime)();
    const settings = yield (0, database_1.getGuildSettings)(interaction.guild);
    const cache = yield (0, cache_1.getCache)(interaction.guild, settings);
    if (cache && settings) {
        if (cache.settings.smokemon_enabled) {
            yield (0, exp_gain_1.checkExpGain)(interaction.user, interaction.guild, interaction);
            yield (0, spawn_monster_1.checkSpawn)(interaction, cache);
        }
    }
    // logger.debug('\n', interaction.options);
    if (!interaction.isCommand())
        return;
    if (timestamp - GCD < 2)
        return;
    const command = interaction.commandName;
    const args = [interaction.options.getString('input')];
    const commandFile = commands_1.commands.find((_r, n) => n.includes(command));
    if (!commandFile)
        return;
    else
        commandFile({
            interaction,
            args,
            client: exports.discordClient,
            dev: true,
            settings: settings,
            cache: cache,
        });
}));
exports.discordClient.on('messageCreate', (message) => __awaiter(void 0, void 0, void 0, function* () {
    const settings = yield (0, database_1.getGuildSettings)(message.guild);
    const cache = yield (0, cache_1.getCache)(message.guild, settings);
    if (cache && settings) {
        if (cache.settings.smokemon_enabled) {
            yield (0, exp_gain_1.checkExpGain)(message.author, message.guild, undefined);
            yield (0, spawn_monster_1.checkSpawn)(message, cache);
        }
    }
}));
/**
 * Register Slash commands for new servers so they can use the commands ASAP. Do I have to do this?
 */
exports.discordClient.on('guildCreate', (guild) => __awaiter(void 0, void 0, void 0, function* () {
    logger.debug(`\nRegistered commands in new guild '${guild.name}' ID: '${guild.id}'\n`);
    const rest = new rest_1.REST({ version: '9' }).setToken((0, config_1.getConfigValue)('DISCORD_TOKEN'));
    yield rest.put(v9_1.Routes.applicationGuildCommands('458710213122457600', guild.id), { body: commands_1.slashCommands });
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
