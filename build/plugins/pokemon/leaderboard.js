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
exports.checkLeaderboard = void 0;
const discord_js_1 = require("discord.js");
const log4js_1 = require("log4js");
const database_1 = require("../../clients/database");
const colors_1 = require("../../colors");
const Monster_1 = require("../../models/Monster");
const monsters_1 = require("./monsters");
const logger = (0, log4js_1.getLogger)('Pokémon-Leaderboard');
function checkLeaderboard(interaction) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        let search = undefined;
        const args = interaction.options.getString('input') !== null ? interaction.options.getString('input').split(' ') : ['iv', 'high'];
        const type = (_a = args[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        const sort = (_b = args[1]) === null || _b === void 0 ? void 0 : _b.toLowerCase();
        if (args.includes('iv') && args.includes('high')) {
            args.splice(args.length - 2, 2);
            search = args.join(' ');
        }
        const monsters = yield getTopPokemon(25, type, sort, search);
        if (monsters) {
            const message_contents = [];
            let shiny = '';
            let legendary = '';
            logger.debug(`Successfully fetched leaderboard! Compiling..`);
            const temp_monsters = [];
            monsters.forEach((element) => {
                const monster = (0, monsters_1.findMonsterByIDLocal)(element.monster_id);
                if (!monster)
                    return;
                if (element.shiny) {
                    shiny = ' ⭐';
                }
                else {
                    shiny = '';
                }
                if (monster.special) {
                    legendary = ` 💠`;
                }
                else {
                    legendary = '';
                }
                const averageIV = (((element.hp +
                    element.attack +
                    element.defense +
                    element.sp_attack +
                    element.sp_defense +
                    element.speed) /
                    186) *
                    100).toFixed(2);
                const tmpMsg = `**${element.id} - ${monster.name.english}${shiny}${legendary} - Level ${element.level} - Avg IV ${averageIV}% - Owner: <@${element.uid}>**`;
                temp_monsters.push({
                    id: element.id,
                    name: monster.name.english,
                    shiny: shiny,
                    level: element.level,
                    iv: averageIV,
                    msg: tmpMsg,
                });
            });
            temp_monsters.forEach((element) => {
                message_contents.push(element.msg);
            });
            const new_msg = message_contents.join('\n');
            const embed = new discord_js_1.MessageEmbed()
                .setAuthor(`Top 25 Pokémon`)
                .setColor(colors_1.COLOR_GREEN)
                .setDescription(new_msg);
            yield interaction.reply({ embeds: [embed] });
        }
        else {
            interaction
                .reply(`There was an error.`)
                .then(() => {
                logger.debug(`There was an error getting the leaderboard.`);
                return;
            })
                .catch((err) => {
                logger.error(err);
            });
        }
    });
}
exports.checkLeaderboard = checkLeaderboard;
function getTopPokemon(limit = 25, type = 'iv', sort = 'high', search) {
    return __awaiter(this, void 0, void 0, function* () {
        if (search) {
            if (type.match(/iv|stats|average/i)) {
                type = 'avg_iv';
            }
            else {
                type = 'avg_iv';
            }
            if (sort == 'low') {
                sort = 'asc';
            }
            else {
                sort = 'desc';
            }
            const monster = (0, monsters_1.findMonsterByName)(search);
            if (monster) {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .where({
                    monster_id: monster.id,
                })
                    .orderBy(type, sort)
                    .limit(limit);
                return monsters;
            }
            else {
                return null;
            }
        }
        else {
            if (type == 'iv' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('avg_iv', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'iv' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('avg_iv', 'asc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'hp' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('hp', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'hp' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('hp', 'asc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'attack' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('attack', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'attack' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('attack', 'asc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'defense' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('defense', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'defense' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('defense', 'asc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'sp_attack' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('sp_attack', 'asc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'sp_attack' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('sp_attack', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'sp_defense' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('sp_defense', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'sp_defense' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('sp_defense', 'asc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'speed' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('speed', 'asc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'speed' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('speed', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'id' && sort == 'high') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('id', 'desc')
                    .limit(limit);
                return monsters;
            }
            else if (type == 'id' && sort == 'low') {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('id', 'asc')
                    .limit(limit);
                return monsters;
            }
            else {
                const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .orderBy('avg_iv', 'desc')
                    .limit(limit);
                return monsters;
            }
        }
    });
}
