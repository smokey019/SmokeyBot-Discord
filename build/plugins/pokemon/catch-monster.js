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
exports.catchMonster = void 0;
const discord_js_1 = require("discord.js");
const cache_1 = require("../../clients/cache");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const queue_1 = require("../../clients/queue");
const colors_1 = require("../../colors");
const Monster_1 = require("../../models/Monster");
const MonsterUser_1 = require("../../models/MonsterUser");
const utils_1 = require("../../utils");
const info_1 = require("./info");
const natures_1 = require("./natures");
const spawn_monster_1 = require("./spawn-monster");
const utils_2 = require("./utils");
const logger = (0, logger_1.getLogger)('Pokemon-Catch');
/**
 * Returns true if the first value matches any of the currently spawned
 * names. Case insensitive.
 *
 * @param messageContent
 * @param currentSpawn
 */
function monsterMatchesPrevious(messageContent, { name }) {
    const split = (0, utils_1.explode)(messageContent.replace(/ {2,}/gm, ' '), ' ', 2);
    if (split.length <= 1)
        return false;
    const monster = split[1].toLowerCase();
    return (monster ==
        name.english
            .replace(/(♂|♀| RS| SS|Galarian |Alolan )/gi, '')
            .toLowerCase() ||
        monster ==
            name.japanese
                .replace(/(♂|♀| RS| SS|Galarian |Alolan )/gi, '')
                .toLowerCase() ||
        monster == name.chinese.toLowerCase().replace(/♂|♀/g, '') ||
        monster == name.french.toLowerCase().replace(/♂|♀/g, '') ||
        monster == name.english.toLowerCase() ||
        monster == name.japanese.toLowerCase());
}
/**
 * Catches a monster.
 *
 * @notes
 * Consider simplifying the parameters. This function should not have to
 * know about `Message` or the entire `cache`. Monster channel missing or
 * don't have a guild ID? Never call this.
 *
 * @notes
 * Each side of this conditional (match vs no match) should probably be
 * broken out into their own functions. `attemptCapture`, `captureFailed`, `captureSuccess`?
 *
 * @param message
 * @param cache
 */
function catchMonster(message, cache) {
    var _a, _b, _c, _d, _e, _f, _g;
    return __awaiter(this, void 0, void 0, function* () {
        const timestamp = (0, utils_1.getCurrentTime)();
        const GCD = yield (0, cache_1.getGCD)(message.guild.id);
        const spawn = yield spawn_monster_1.MONSTER_SPAWNS.get(message.guild.id);
        if (spawn.monster &&
            monsterMatchesPrevious(message.content.toLowerCase(), spawn.monster)) {
            logger.trace(`${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name} - ${message.author.username} | Starting catch~`);
            let level = 0;
            const shiny = (0, utils_2.rollShiny)();
            let gender = (0, utils_2.rollGender)();
            let isEgg = 0;
            const currentSpawn = spawn.monster;
            if (currentSpawn.name.english == 'Egg') {
                isEgg = 1;
            }
            if (currentSpawn.evoLevel) {
                level = (0, utils_2.rollLevel)(currentSpawn.evoLevel, 60);
            }
            else {
                level = (0, utils_2.rollLevel)(1, 49);
            }
            if (currentSpawn.gender == 'N') {
                gender = 'N';
            }
            spawn.monster = null;
            yield spawn_monster_1.MONSTER_SPAWNS.set(message.guild.id, spawn);
            const monster = {
                monster_id: currentSpawn.id,
                hp: (0, utils_1.getRndInteger)(1, 31),
                attack: (0, utils_1.getRndInteger)(1, 31),
                defense: (0, utils_1.getRndInteger)(1, 31),
                sp_attack: (0, utils_1.getRndInteger)(1, 31),
                sp_defense: (0, utils_1.getRndInteger)(1, 31),
                speed: (0, utils_1.getRndInteger)(1, 31),
                nature: (0, natures_1.getRandomNature)(),
                experience: level * 1250,
                level: level,
                uid: message.author.id,
                original_uid: message.author.id,
                shiny: shiny,
                captured_at: Date.now(),
                gender: gender,
                egg: isEgg,
            };
            const isPerfect = (0, utils_2.rollPerfectIV)();
            if (isPerfect) {
                monster.hp = (0, utils_1.getRndInteger)(28, 31);
                monster.attack = (0, utils_1.getRndInteger)(28, 31);
                monster.defense = (0, utils_1.getRndInteger)(28, 31);
                monster.sp_attack = (0, utils_1.getRndInteger)(28, 31);
                monster.sp_defense = (0, utils_1.getRndInteger)(28, 31);
                monster.speed = (0, utils_1.getRndInteger)(28, 31);
                monster.avg_iv = parseFloat((((monster.hp +
                    monster.attack +
                    monster.defense +
                    monster.sp_attack +
                    monster.sp_defense +
                    monster.speed) /
                    186) *
                    100).toFixed(2));
            }
            const averageIV = (((monster.hp +
                monster.attack +
                monster.defense +
                monster.sp_attack +
                monster.sp_defense +
                monster.speed) /
                186) *
                100).toFixed(2);
            monster.avg_iv = parseFloat(averageIV);
            try {
                const dex = yield (0, info_1.userDex)(message);
                const insertMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable).insert(monster);
                const updateUser = yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                    .where({ uid: message.author.id })
                    .update({ latest_monster: insertMonster[0] })
                    .increment('currency', 10)
                    .increment('streak', 1);
                if (!updateUser) {
                    logger.debug(`${(_b = message.guild) === null || _b === void 0 ? void 0 : _b.name} - ${message.author.username} | Couldn't update user, insert to user DB~`);
                    yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable).insert({
                        current_monster: insertMonster[0],
                        latest_monster: insertMonster[0],
                        uid: message.author.id,
                        dex: '[]',
                    });
                    logger.debug(`Successfully inserted user ${message.author.username}`);
                }
                if (insertMonster) {
                    const random_grats = ['YOINK', 'YOINKERS', 'NICE', 'NOICE', 'Congrats'];
                    let response = ``;
                    let shiny_msg = '';
                    let legendary = '';
                    let egg_info = ``;
                    if (shiny) {
                        shiny_msg = ' ⭐';
                    }
                    if (currentSpawn.name.english == 'Egg') {
                        egg_info = '\n\nEggs have a random chance of hatching into anything, with an increased chance at being shiny by selecting and leveling it to 50!';
                    }
                    if (currentSpawn.special) {
                        legendary = ` 💠`;
                    }
                    currentSpawn.id = parseFloat(currentSpawn.id.toString());
                    if (shiny == 1 && !dex.includes(currentSpawn.id)) {
                        response = `_**POGGERS**_! You caught a __***SHINY***__ level **${level} ${currentSpawn.name.english}**${shiny_msg + legendary}! \n\n Avg IV: **${averageIV}**% \nID: **${insertMonster[0]}** \n\nAdded to Pokédex.$`;
                        logger.error(`'${(_c = message.guild) === null || _c === void 0 ? void 0 : _c.name}' - '${message.author.username}' CAUGHT A SHINY POKéMON~'`);
                        yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                            .where({ uid: message.author.id })
                            .increment('currency', 1000);
                    }
                    else if (shiny == 0 && !dex.includes(currentSpawn.id)) {
                        response = `**${random_grats[(0, utils_1.getRndInteger)(0, random_grats.length - 1)]}**! You caught a level **${level} ${currentSpawn.name.english}**${shiny_msg + legendary}! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}** - Added to Pokédex.`;
                        logger.info(`'${(_d = message.guild) === null || _d === void 0 ? void 0 : _d.name}' - '${message.author.username}' CAUGHT A POKéMON~`);
                        yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                            .where({ uid: message.author.id })
                            .increment('currency', 100);
                    }
                    else if (shiny == 0 && dex.includes(currentSpawn.id)) {
                        response = `**${random_grats[(0, utils_1.getRndInteger)(0, random_grats.length - 1)]}**! You caught a level **${level} ${currentSpawn.name.english}**${shiny_msg + legendary}! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}**.`;
                        logger.info(`'${(_e = message.guild) === null || _e === void 0 ? void 0 : _e.name}' - '${message.author.username}' CAUGHT A POKéMON~`);
                    }
                    else if (shiny == 1 && dex.includes(currentSpawn.id)) {
                        response = `_**POGGERS**_! You caught a __***SHINY***__ level **${level} ${currentSpawn.name.english}${shiny_msg + legendary}**! \n\n Avg IV: **${averageIV}**% \nID: **${insertMonster[0]}**.`;
                        logger.error(`'${(_f = message.guild) === null || _f === void 0 ? void 0 : _f.name}' - '${message.author.username}' CAUGHT A SHINY POKéMON~`);
                    }
                    response = response + egg_info;
                    const user = yield (0, database_1.getUser)(message.author.id);
                    if (user) {
                        if (user.streak == 10) {
                            yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                                .where({ uid: message.author.id })
                                .update({ streak: 0 })
                                .increment('currency', 250);
                        }
                    }
                    if (shiny) {
                        const embed = new discord_js_1.MessageEmbed()
                            .setColor(colors_1.COLOR_PURPLE)
                            .setTitle('⭐ ' + currentSpawn.name.english + ' ⭐')
                            .setDescription(response)
                            .setImage(currentSpawn.images.shiny)
                            .setTimestamp();
                        const monsterChannel = (_g = message.guild) === null || _g === void 0 ? void 0 : _g.channels.cache.find((ch) => ch.name === cache.settings.specific_channel);
                        (0, queue_1.queueMsg)(embed, message, false, 1, monsterChannel, true);
                    }
                    else {
                        (0, queue_1.queueMsg)(response, message, true, 1);
                    }
                }
            }
            catch (error) {
                logger.error(error);
            }
        }
        else if (timestamp - (GCD || 0) > 5) {
            cache_1.GLOBAL_COOLDOWN.set(message.guild.id, (0, utils_1.getCurrentTime)());
            (0, queue_1.queueMsg)(`That is the wrong Pokémon!`, message, true, 1);
            logger.trace(`${message.author.username} is WRONG!`);
        }
    });
}
exports.catchMonster = catchMonster;
