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
exports.searchMonsters = exports.checkFavorites = exports.checkPokedex = exports.checkMonsters = exports.checkMonstersNew = void 0;
const discord_js_1 = require("discord.js");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const queue_1 = require("../../clients/queue");
const colors_1 = require("../../colors");
const Monster_1 = require("../../models/Monster");
const utils_1 = require("../../utils");
const info_1 = require("./info");
const monsters_1 = require("./monsters");
const logger = (0, logger_1.getLogger)('Pokémon');
function checkMonstersNew(interaction, favorites) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        logger.debug(`Fetching Pokémon for ${interaction.user.username} in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}..`);
        let pokemon;
        if (favorites) {
            pokemon = yield (0, monsters_1.getUsersFavoriteMonsters)(interaction.user.id);
        }
        else {
            pokemon = yield (0, monsters_1.getUsersMonsters)(interaction.user.id);
        }
        const sort = interaction.options.getString('options');
        if (pokemon) {
            let message_contents = [];
            let shiny = '';
            let favorite = '';
            let legendary = '';
            logger.debug(`Successfully fetched! Compiling..`);
            const temp_monsters = [];
            const user = yield (0, database_1.getUser)(interaction.user.id);
            const current_monster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .first()
                .where('id', user.current_monster);
            pokemon.forEach((element) => {
                const monster = (0, monsters_1.findMonsterByIDLocal)(element.monster_id);
                if (!monster)
                    return;
                if (element.shiny) {
                    shiny = ' ⭐';
                }
                else {
                    shiny = '';
                }
                if (element.favorite) {
                    favorite = ' 💟';
                }
                else {
                    favorite = '';
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
                let tmpMsg = '';
                if (element.id == current_monster.id) {
                    tmpMsg = `__**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**__`;
                }
                else {
                    tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`;
                }
                temp_monsters.push({
                    id: element.id,
                    name: monster.name.english,
                    shiny: shiny,
                    level: element.level,
                    iv: averageIV,
                    msg: tmpMsg,
                });
            });
            if (sort == 'iv_high') {
                temp_monsters.sort(function (a, b) {
                    return b.iv - a.iv;
                });
            }
            else if (sort == 'iv_low') {
                temp_monsters.sort(function (a, b) {
                    return a.iv - b.iv;
                });
            }
            else if (sort == 'level_low') {
                temp_monsters.sort(function (a, b) {
                    return a.level - b.level;
                });
            }
            else if (sort == 'level_high') {
                temp_monsters.sort(function (a, b) {
                    return b.level - a.level;
                });
            }
            else if (sort == 'id_high') {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            else if (sort == 'id_low') {
                temp_monsters.sort(function (a, b) {
                    return a.id - b.id;
                });
            }
            else if (sort == 'shiny_high') {
                temp_monsters.sort(function (a, b) {
                    return b.shiny - a.shiny;
                });
            }
            else if (sort == 'shiny_low') {
                temp_monsters.sort(function (a, b) {
                    return a.shiny - b.shiny;
                });
            }
            else if (sort == 'name_low') {
                temp_monsters.sort(function (a, b) {
                    return b.name - a.name;
                });
            }
            else if (sort == 'name_high') {
                temp_monsters.sort(function (a, b) {
                    return a.name - b.name;
                });
            }
            else {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            temp_monsters.forEach((element) => {
                message_contents.push(element.msg);
            });
            let all_monsters = [];
            if (message_contents.length > 20) {
                all_monsters = (0, utils_1.chunk)(message_contents, 20);
                message_contents = all_monsters[0];
                message_contents.push(`\nTotal Monsters: **${pokemon.length}**`);
            }
            let new_msg = message_contents.join('\n');
            if (new_msg.length > 2000) {
                new_msg = new_msg.slice(0, 1997) + '...';
            }
            const embed = new discord_js_1.MessageEmbed()
                .setAuthor('User Profile', (_b = interaction.user.avatarURL()) === null || _b === void 0 ? void 0 : _b.toString(), `https://bot.smokey.gg/user/${interaction.user.id}/pokemon`)
                .setTitle(`${interaction.user.username}'s Pokémon\n\nShowing: ${(0, utils_1.format_number)(message_contents.length) +
                '/' +
                (0, utils_1.format_number)(pokemon.length)}`)
                .setColor(colors_1.COLOR_GREEN)
                .setDescription(new_msg);
            (0, queue_1.queueMsg)(embed, interaction, true, 1, undefined, true);
            logger.debug(`Sent Pokémon for ${interaction.user.tag} in ${(_c = interaction.guild) === null || _c === void 0 ? void 0 : _c.name}!`);
        }
        else {
            (0, queue_1.queueMsg)("You don't have any Pokémon.", interaction, true);
        }
    });
}
exports.checkMonstersNew = checkMonstersNew;
/**
 *
 * @param message
 */
function checkMonsters(interaction, args) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        logger.debug(`Fetching Pokémon for ${interaction.user.username} in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}..`);
        const splitMsg = args;
        const sort = [splitMsg[1], splitMsg[2]];
        const pokemon = yield (0, monsters_1.getUsersMonsters)(interaction.user.id);
        if (pokemon.length > 0) {
            let message_contents = [];
            let shiny = '';
            let favorite = '';
            let legendary = '';
            logger.debug(`Successfully fetched! Compiling..`);
            const temp_monsters = [];
            const user = yield (0, database_1.getUser)(interaction.user.id);
            const current_monster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .first()
                .where('id', user.current_monster);
            pokemon.forEach((element) => {
                const monster = (0, monsters_1.findMonsterByIDLocal)(element.monster_id);
                if (!monster)
                    return;
                if ((splitMsg[splitMsg.length - 1].match(/legendary/i) &&
                    monster.special != 'Legendary') ||
                    (splitMsg[splitMsg.length - 1].match(/mythical/i) &&
                        monster.special != 'Mythical') ||
                    (splitMsg[splitMsg.length - 1].match(/ultrabeast/i) &&
                        monster.special != 'Ultrabeast') ||
                    (splitMsg[splitMsg.length - 1].match(/shiny/i) && !element.shiny) ||
                    (splitMsg[splitMsg.length - 1].match(/mega/i) && !monster.forme)) {
                    return;
                }
                if (element.shiny) {
                    shiny = ' ⭐';
                }
                else {
                    shiny = '';
                }
                if (element.favorite) {
                    favorite = ' 💟';
                }
                else {
                    favorite = '';
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
                let tmpMsg = '';
                if (element.id == current_monster.id) {
                    tmpMsg = `__**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**__`;
                }
                else {
                    tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`;
                }
                temp_monsters.push({
                    id: element.id,
                    name: monster.name.english,
                    shiny: shiny,
                    level: element.level,
                    iv: averageIV,
                    msg: tmpMsg,
                });
            });
            if (sort[0] == 'iv' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.iv - a.iv;
                });
            }
            else if (sort[0] == 'iv' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.iv - b.iv;
                });
            }
            else if (sort[0] == 'level' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.level - b.level;
                });
            }
            else if (sort[0] == 'level' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.level - a.level;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.id - b.id;
                });
            }
            else if (sort[0] == 'shiny' && sort[1] == '+') {
                temp_monsters.sort(function (a, b) {
                    return b.shiny - a.shiny;
                });
            }
            else if (sort[0] == 'shiny' && sort[1] == '-') {
                temp_monsters.sort(function (a, b) {
                    return a.shiny - b.shiny;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'desc') {
                temp_monsters.sort(function (a, b) {
                    return b.name - a.name;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'asc') {
                temp_monsters.sort(function (a, b) {
                    return a.name - b.name;
                });
            }
            else {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            temp_monsters.forEach((element) => {
                message_contents.push(element.msg);
            });
            let all_monsters = [];
            if (message_contents.length > 20) {
                all_monsters = (0, utils_1.chunk)(message_contents, 20);
                if (splitMsg.length >= 4 &&
                    all_monsters.length > 1 &&
                    !splitMsg[splitMsg.length - 1].match(/legendary|mythical|ultrabeast|shiny|mega/i)) {
                    const page = parseInt(splitMsg[splitMsg.length - 1]) - 1;
                    if (all_monsters[page]) {
                        message_contents = all_monsters[page];
                        message_contents.push(`Page: **${page + 1}/${(0, utils_1.format_number)(all_monsters.length)}**`);
                    }
                }
                else {
                    message_contents = all_monsters[0];
                    message_contents.push(`Page: **1/${(0, utils_1.format_number)(all_monsters.length)}**`);
                }
            }
            const new_msg = message_contents.join('\n');
            const embed = new discord_js_1.MessageEmbed()
                .setAuthor(`${interaction.user.username}'s Pokémon\nShowing: ${(0, utils_1.format_number)(message_contents.length) +
                '/' +
                (0, utils_1.format_number)(pokemon.length)}`, (_b = interaction.user.avatarURL()) === null || _b === void 0 ? void 0 : _b.toString())
                .setColor(colors_1.COLOR_GREEN)
                .setDescription(new_msg);
            yield interaction.channel
                .send({ embeds: [embed] })
                .then(() => {
                var _a;
                logger.debug(`Sent Pokémon for ${interaction.user.tag} in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
        else {
            interaction
                .reply(`You don't have any monsters in your Pokédex. :(`)
                .then(() => {
                logger.debug(`${interaction.user.username} doesn't have any Pokémon!`);
                return;
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
    });
}
exports.checkMonsters = checkMonsters;
function checkPokedex(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const pokemon = yield (0, info_1.userDex)(interaction.user.id);
        const pokedex = (0, monsters_1.getPokedex)();
        const msg_array = [];
        let pokemon_count = 0;
        const missing = interaction.options.getBoolean('missing');
        pokedex.forEach((dex) => {
            if (!dex.images || !dex.images.normal)
                return;
            let count = 0;
            if (pokemon.includes(dex.id)) {
                pokemon.forEach((monster) => {
                    if (monster == dex.id) {
                        count++;
                    }
                });
                if (!missing) {
                    msg_array.push(`**${dex.id}** - **${dex.name.english}** - **${count}**`);
                    pokemon_count++;
                }
            }
            else {
                msg_array.push(`**${dex.id}** - **${dex.name.english}** - **0**`);
                pokemon_count++;
            }
        });
        const all_monsters = (0, utils_1.chunk)(msg_array, 20);
        const new_msg = all_monsters.join('\n');
        const embed = new discord_js_1.MessageEmbed()
            .setAuthor(`Pokédex - Total Pokémon: ${pokemon_count}`, interaction.user.avatarURL())
            .setColor(colors_1.COLOR_WHITE)
            .setDescription(new_msg);
        yield interaction.channel
            .send({ embeds: [embed] })
            .then((interaction) => {
            var _a;
            logger.debug(`Sent PokeDex in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
        })
            .catch((err) => __awaiter(this, void 0, void 0, function* () {
            logger.error(err);
        }));
    });
}
exports.checkPokedex = checkPokedex;
/**
 *
 * @param message
 */
function checkFavorites(interaction, args) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        logger.debug(`Fetching Favorite Pokémon for ${interaction.user.tag} in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}..`);
        const splitMsg = args;
        const sort = [splitMsg[1], splitMsg[2]];
        const pokemon = yield (0, monsters_1.getUsersFavoriteMonsters)(interaction.user.id);
        if (pokemon.length > 0) {
            let message_contents = [];
            let shiny = '';
            let favorite = '';
            let legendary = '';
            logger.trace(`Successfully fetched! Compiling..`);
            const temp_monsters = [];
            pokemon.forEach((element) => {
                const monster = (0, monsters_1.findMonsterByIDLocal)(element.monster_id);
                if (!monster)
                    return;
                if ((splitMsg[splitMsg.length - 1].match(/legendary/i) &&
                    monster.special != 'Legendary') ||
                    (splitMsg[splitMsg.length - 1].match(/mythical/i) &&
                        monster.special != 'Mythical') ||
                    (splitMsg[splitMsg.length - 1].match(/ultrabeast/i) &&
                        monster.special != 'Ultrabeast') ||
                    (splitMsg[splitMsg.length - 1].match(/shiny/i) && !element.shiny) ||
                    (splitMsg[splitMsg.length - 1].match(/mega/i) && !monster.forme)) {
                    return;
                }
                if (element.shiny) {
                    shiny = ' ⭐';
                }
                else {
                    shiny = '';
                }
                if (element.favorite) {
                    favorite = ' 💟';
                }
                else {
                    favorite = '';
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
                const tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`;
                temp_monsters.push({
                    id: element.id,
                    name: monster.name.english,
                    shiny: shiny,
                    level: element.level,
                    iv: averageIV,
                    msg: tmpMsg,
                });
            });
            if (sort[0] == 'iv' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.iv - a.iv;
                });
            }
            else if (sort[0] == 'iv' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.iv - b.iv;
                });
            }
            else if (sort[0] == 'level' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.level - b.level;
                });
            }
            else if (sort[0] == 'level' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.level - a.level;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.id - b.id;
                });
            }
            else if (sort[0] == 'shiny' && sort[1] == '+') {
                temp_monsters.sort(function (a, b) {
                    return b.shiny - a.shiny;
                });
            }
            else if (sort[0] == 'shiny' && sort[1] == '-') {
                temp_monsters.sort(function (a, b) {
                    return a.shiny - b.shiny;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'desc') {
                temp_monsters.sort(function (a, b) {
                    return b.name - a.name;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'asc') {
                temp_monsters.sort(function (a, b) {
                    return a.name - b.name;
                });
            }
            else {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            temp_monsters.forEach((element) => {
                message_contents.push(element.msg);
            });
            let all_monsters = [];
            if (message_contents.length > 20) {
                all_monsters = (0, utils_1.chunk)(message_contents, 20);
                if (splitMsg.length >= 4 &&
                    all_monsters.length > 1 &&
                    !splitMsg[splitMsg.length - 1].match(/legendary|mythical|ultrabeast|shiny|mega/i)) {
                    const page = parseInt(splitMsg[splitMsg.length - 1]) - 1;
                    if (all_monsters[page]) {
                        message_contents = all_monsters[page];
                        message_contents.push(`Page: **${page + 1}/${(0, utils_1.format_number)(all_monsters.length)}**`);
                    }
                }
                else {
                    message_contents = all_monsters[0];
                    message_contents.push(`Page: **1/${(0, utils_1.format_number)(all_monsters.length)}**`);
                }
            }
            const new_msg = message_contents.join('\n');
            const embed = new discord_js_1.MessageEmbed()
                .setAuthor(`${interaction.user.username}'s Favorites\nShowing: ${(0, utils_1.format_number)(message_contents.length) +
                '/' +
                (0, utils_1.format_number)(pokemon.length)}\nTotal: ${(0, utils_1.format_number)(pokemon.length)}`, (_b = interaction.user.avatarURL()) === null || _b === void 0 ? void 0 : _b.toString())
                .setColor(colors_1.COLOR_WHITE)
                .setDescription(new_msg);
            yield interaction.channel
                .send({ embeds: [embed] })
                .then((interaction) => {
                var _a;
                logger.debug(`Sent favorites in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
        else {
            interaction
                .reply(`You don't have any favorite monsters in your Pokédex. :( Use \`!favorite ID\` to add one.`)
                .then(() => {
                logger.debug(`${interaction.user.username} doesn't have any favorite Pokémon!`);
                return;
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
    });
}
exports.checkFavorites = checkFavorites;
/**
 *
 * @param message
 */
function searchMonsters(interaction) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const sort = ['iv', 'high'];
        const search = interaction.options.getString('pokemon').toLowerCase().replace(/ {2,}/g, ' ');
        const page = 0;
        const pokemon = yield (0, monsters_1.getUsersMonsters)(interaction.user.id);
        if (pokemon.length > 0) {
            let message_contents = [];
            let shiny = '';
            let favorite = '';
            let legendary = '';
            const temp_monsters = [];
            pokemon.forEach((element) => {
                const monster = (0, monsters_1.findMonsterByIDLocal)(element.monster_id);
                if (!monster)
                    return;
                if (monster.name.english.toLowerCase().replace(/♂|♀/g, '') != search)
                    return;
                if (element.shiny) {
                    shiny = ' ⭐';
                }
                else {
                    shiny = '';
                }
                if (element.favorite) {
                    favorite = ' 💟';
                }
                else {
                    favorite = '';
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
                const tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **LVL ${element.level}** - **IV ${averageIV}%**`;
                temp_monsters.push({
                    id: element.id,
                    name: monster.name.english,
                    shiny: shiny,
                    level: element.level,
                    iv: averageIV,
                    msg: tmpMsg,
                });
            });
            if (sort[0] == 'iv' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.iv - a.iv;
                });
            }
            else if (sort[0] == 'iv' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.iv - b.iv;
                });
            }
            else if (sort[0] == 'level' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.level - b.level;
                });
            }
            else if (sort[0] == 'level' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.level - a.level;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'high') {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'low') {
                temp_monsters.sort(function (a, b) {
                    return a.id - b.id;
                });
            }
            else if (sort[0] == 'shiny' && sort[1] == '+') {
                temp_monsters.sort(function (a, b) {
                    return b.shiny - a.shiny;
                });
            }
            else if (sort[0] == 'shiny' && sort[1] == '-') {
                temp_monsters.sort(function (a, b) {
                    return a.shiny - b.shiny;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'desc') {
                temp_monsters.sort(function (a, b) {
                    return b.name - a.name;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'asc') {
                temp_monsters.sort(function (a, b) {
                    return a.name - b.name;
                });
            }
            else {
                temp_monsters.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            temp_monsters.forEach((element) => {
                message_contents.push(element.msg);
            });
            if (message_contents.length > 10) {
                let all_monsters = [];
                all_monsters = (0, utils_1.chunk)(message_contents, 10);
                if (page && all_monsters.length > 1) {
                    if (all_monsters[page]) {
                        message_contents = all_monsters[page];
                    }
                }
                else {
                    message_contents = all_monsters[0];
                }
                const new_msg = message_contents.join('\n');
                const embed = new discord_js_1.MessageEmbed()
                    .setAuthor(`${interaction.user.username}'s search for '${search}' - Total: ${(0, utils_1.format_number)(message_contents.length) +
                    '/' +
                    (0, utils_1.format_number)(pokemon.length)} - Pages: ${(0, utils_1.format_number)(all_monsters.length)}`, (_a = interaction.user.avatarURL()) === null || _a === void 0 ? void 0 : _a.toString())
                    .setColor(0xff0000)
                    .setDescription(new_msg);
                yield interaction.reply({ embeds: [embed] })
                    .then(() => {
                    var _a;
                    logger.debug(`Sent Pokémon for ${interaction.user.username} in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
                })
                    .catch((err) => __awaiter(this, void 0, void 0, function* () {
                    logger.error(err);
                }));
            }
            else if (message_contents.length == 0) {
                interaction.reply(`Cannot find '${search}'.`);
            }
            else {
                const new_msg = message_contents.join('\n');
                const embed = new discord_js_1.MessageEmbed()
                    .setAuthor(`${interaction.user.username}'s search for '${search}' - Total: ${(0, utils_1.format_number)(message_contents.length) +
                    '/' +
                    (0, utils_1.format_number)(pokemon.length)}`, (_b = interaction.user.avatarURL()) === null || _b === void 0 ? void 0 : _b.toString())
                    .setColor(0xff0000)
                    .setDescription(new_msg);
                yield interaction.reply({ embeds: [embed] })
                    .then(() => {
                    var _a;
                    logger.debug(`Sent Pokémon for ${interaction.user.username} in ${(_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
                })
                    .catch((err) => __awaiter(this, void 0, void 0, function* () {
                    logger.error(err);
                }));
            }
        }
        else {
            interaction
                .reply(`You don't have any monsters in your Pokédex. :(`)
                .then(() => {
                logger.debug(`${interaction.user.username} doesn't have any Pokémon!`);
                return;
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
    });
}
exports.searchMonsters = searchMonsters;
