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
exports.forceSpawn = exports.spawnMonster = exports.checkSpawn = exports.MONSTER_SPAWNS = void 0;
const discord_js_1 = require("discord.js");
const cache_1 = require("../../clients/cache");
const database_1 = require("../../clients/database");
const discord_1 = require("../../clients/discord");
const logger_1 = require("../../clients/logger");
const queue_1 = require("../../clients/queue");
const colors_1 = require("../../colors");
const utils_1 = require("../../utils");
const monsters_1 = require("./monsters");
const weather_1 = require("./weather");
exports.MONSTER_SPAWNS = (0, cache_1.loadCache)('MONSTER_SPAWNS', 500);
const logger = (0, logger_1.getLogger)('Pokémon-Spawn');
function checkSpawn(interaction, cache) {
    return __awaiter(this, void 0, void 0, function* () {
        let spawn = yield exports.MONSTER_SPAWNS.get(interaction.guild.id);
        if (!spawn) {
            spawn = {
                monster: undefined,
                spawned_at: (0, utils_1.getCurrentTime)() - 30,
            };
            exports.MONSTER_SPAWNS.set(interaction.guild.id, spawn);
        }
        else {
            const spawn_timer = (0, utils_1.getRndInteger)((0, utils_1.getRndInteger)(15, 120), 300);
            const timestamp = (0, utils_1.getCurrentTime)();
            if (timestamp - spawn.spawned_at > spawn_timer &&
                !discord_1.rateLimited &&
                !discord_1.initializing) {
                yield spawnMonster(interaction, cache);
            }
        }
    });
}
exports.checkSpawn = checkSpawn;
/**
 * Spawns a random Monster.
 *
 * @param interaction
 * @param cache
 */
function spawnMonster(interaction, cache) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const monsterChannel = interaction.guild.channels.cache.find((ch) => ch.name === cache.settings.specific_channel);
        if (!monsterChannel) {
            const updateGuild = yield (0, database_1.databaseClient)(database_1.GuildSettingsTable)
                .where({ guild_id: interaction.guild.id })
                .update({ smokemon_enabled: 0 });
            if (updateGuild) {
                logger.error(`Disabled smokeMon for server '${interaction.guild.name}' since no channel to spawn in.`);
            }
        }
        else {
            const spawn_data = {
                monster: yield (0, monsters_1.findMonsterByID)((0, monsters_1.getRandomMonster)()),
                spawned_at: (0, utils_1.getCurrentTime)(),
            };
            let boostCount = 0;
            const boost = yield (0, weather_1.getBoostedWeatherSpawns)(interaction, cache);
            let isBoosted = false;
            try {
                while (!((_a = spawn_data.monster) === null || _a === void 0 ? void 0 : _a.name.english) ||
                    // spawn_data.monster.forme == "Mega" ||
                    !spawn_data.monster.images ||
                    !spawn_data.monster.images.normal ||
                    (boostCount < 10 && !isBoosted)) {
                    logger.trace('Invalid monster found or trying to find a boosted type..');
                    spawn_data.monster = yield (0, monsters_1.findMonsterByID)((0, monsters_1.getRandomMonster)());
                    (_b = spawn_data.monster.type) === null || _b === void 0 ? void 0 : _b.forEach((element) => {
                        if (boost.boosts.includes(element)) {
                            isBoosted = true;
                        }
                    });
                    boostCount++;
                }
                exports.MONSTER_SPAWNS.set(interaction.guild.id, spawn_data);
                logger.info(`'${interaction.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`);
                const embed = new discord_js_1.MessageEmbed({
                    color: spawn_data.monster.color,
                    description: 'Type ~catch <Pokémon> to try and catch it!',
                    image: {
                        url: spawn_data.monster.images.normal,
                    },
                    title: 'A wild Pokémon has appeared!',
                });
                (0, queue_1.queueMsg)(embed, interaction, false, 1, monsterChannel, true);
            }
            catch (error) {
                logger.error(error);
            }
        }
    });
}
exports.spawnMonster = spawnMonster;
/**
 * Force spawn a selected monster w/ ID.
 * @param message
 * @param cache
 */
function forceSpawn(interaction, cache) {
    return __awaiter(this, void 0, void 0, function* () {
        const monsterChannel = interaction.guild.channels.cache.find((ch) => ch.name === cache.settings.specific_channel);
        const monster = parseFloat(interaction.options.getString('pokemon'));
        const spawn_data = {
            monster: yield (0, monsters_1.findMonsterByID)(monster),
            spawned_at: (0, utils_1.getCurrentTime)(),
        };
        try {
            exports.MONSTER_SPAWNS.set(interaction.guild.id, spawn_data);
            logger.info(`'${interaction.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`);
            const embed = new discord_js_1.MessageEmbed({
                color: colors_1.COLOR_PURPLE,
                description: 'Type ~catch <Pokémon> to try and catch it!',
                image: {
                    url: spawn_data.monster.images.normal,
                },
                title: 'A wild Pokémon has appeared!',
            });
            (0, queue_1.queueMsg)(embed, interaction, false, 1, monsterChannel, true);
        }
        catch (error) {
            logger.error(error);
            console.log(spawn_data.monster);
        }
    });
}
exports.forceSpawn = forceSpawn;
