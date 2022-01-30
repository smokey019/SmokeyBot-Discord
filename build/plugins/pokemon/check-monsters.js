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
exports.searchMonsters = exports.checkFavorites = exports.checkPokedex = exports.checkMonsters = void 0;
const discord_js_1 = require("discord.js");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const colors_1 = require("../../colors");
const Monster_1 = require("../../models/Monster");
const utils_1 = require("../../utils");
const info_1 = require("./info");
const monsters_1 = require("./monsters");
const logger = (0, logger_1.getLogger)('Pokemon');
/**
 *
 * @param message
 */
function checkMonsters(message) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        logger.debug(`Fetching Pokémon for ${message.author.username} in ${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}..`);
        const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');
        const sort = [splitMsg[1], splitMsg[2]];
        const pokemon = yield (0, monsters_1.getUsersMonsters)(message.author.id);
        if (pokemon.length > 0) {
            let message_contents = [];
            let shiny = '';
            let favorite = '';
            let legendary = '';
            logger.debug(`Successfully fetched! Compiling..`);
            const temp_monsters = [];
            const user = yield (0, database_1.getUser)(message.author.id);
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
                .setAuthor(`${message.author.username}'s Pokémon\nShowing: ${(0, utils_1.format_number)(message_contents.length) +
                '/' +
                (0, utils_1.format_number)(pokemon.length)}`, (_b = message.author.avatarURL()) === null || _b === void 0 ? void 0 : _b.toString())
                .setColor(colors_1.COLOR_GREEN)
                .setDescription(new_msg);
            yield message.channel
                .send({ embeds: [embed] })
                .then(() => {
                var _a;
                logger.debug(`Sent Pokémon for ${message.author.tag} in ${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
        else {
            message
                .reply(`You don't have any monsters in your Pokédex. :(`)
                .then(() => {
                logger.debug(`${message.author.username} doesn't have any Pokémon!`);
                return;
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
    });
}
exports.checkMonsters = checkMonsters;
function checkPokedex(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const pokemon = yield (0, info_1.userDex)(message);
        const pokedex = (0, monsters_1.getPokedex)();
        let msg_array = [];
        let pokemon_count = 0;
        const splitMsg = message.content.split(' ');
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
                if (!message.content.match(/missing/i)) {
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
        if (splitMsg.length > 1 && !splitMsg[splitMsg.length - 1].match(/missing/i)) {
            const page = parseInt(splitMsg[splitMsg.length - 1]) - 1;
            if (all_monsters[page]) {
                msg_array = all_monsters[page];
                msg_array.push(`Page: **${page + 1}/${(0, utils_1.format_number)(all_monsters.length)}**`);
            }
        }
        else {
            msg_array = all_monsters[0];
            msg_array.push(`Page: **1/${(0, utils_1.format_number)(all_monsters.length)}**`);
        }
        const new_msg = msg_array.join('\n');
        const embed = new discord_js_1.MessageEmbed()
            .setAuthor(`Pokédex - Total Pokémon: ${pokemon_count}`, message.author.avatarURL())
            .setColor(colors_1.COLOR_WHITE)
            .setDescription(new_msg);
        yield message.channel
            .send({ embeds: [embed] })
            .then((message) => {
            var _a;
            logger.debug(`Sent PokeDex in ${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
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
function checkFavorites(message) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        logger.debug(`Fetching Favorite Pokémon for ${message.author.tag} in ${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}..`);
        const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');
        const sort = [splitMsg[1], splitMsg[2]];
        const pokemon = yield (0, monsters_1.getUsersFavoriteMonsters)(message.author.id);
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
                .setAuthor(`${message.author.username}'s Favorites\nShowing: ${(0, utils_1.format_number)(message_contents.length) +
                '/' +
                (0, utils_1.format_number)(pokemon.length)}\nTotal: ${(0, utils_1.format_number)(pokemon.length)}`, (_b = message.author.avatarURL()) === null || _b === void 0 ? void 0 : _b.toString())
                .setColor(colors_1.COLOR_WHITE)
                .setDescription(new_msg);
            yield message.channel
                .send({ embeds: [embed] })
                .then((message) => {
                var _a;
                logger.debug(`Sent favorites in ${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
        else {
            message
                .reply(`You don't have any favorite monsters in your Pokédex. :( Use \`!favorite ID\` to add one.`)
                .then(() => {
                logger.debug(`${message.author.username} doesn't have any favorite Pokémon!`);
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
function searchMonsters(message) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');
        const isQuote = message.content.match('"');
        let sort = ['iv', 'high'];
        let search = undefined;
        let page = 0;
        if (isQuote) {
            const parseSearch = message.content.replace(/ {2,}/gm, ' ').split('"');
            const splitSort = parseSearch[parseSearch.length - 1].split(' ');
            search = parseSearch[1].toLowerCase();
            if (splitSort.length == 3) {
                sort = [splitSort[1], splitSort[2]];
            }
            else if (splitSort.length == 4) {
                sort = [splitSort[1], splitSort[2]];
                page = parseInt(splitSort[splitSort.length - 1]) - 1;
            }
        }
        else {
            const parseSearch = message.content.replace(/ {2,}/gm, ' ').split(' ');
            sort = [splitMsg[2], splitMsg[3]];
            search = parseSearch[1].toLowerCase();
        }
        const pokemon = yield (0, monsters_1.getUsersMonsters)(message.author.id);
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
                if (isQuote &&
                    monster.name.english.toLowerCase().replace(/♂|♀/g, '') != search)
                    return;
                if (!isQuote &&
                    !monster.name.english
                        .toLowerCase()
                        .replace(/♂|♀/g, '')
                        .match(splitMsg[1].toLowerCase()))
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
                if (splitMsg.length > 4 && all_monsters.length > 1) {
                    if (all_monsters[page]) {
                        message_contents = all_monsters[page];
                    }
                }
                else {
                    message_contents = all_monsters[0];
                }
                const new_msg = message_contents.join('\n');
                const embed = new discord_js_1.MessageEmbed()
                    .setAuthor(`${message.author.username}'s search for '${search}' - Total: ${(0, utils_1.format_number)(message_contents.length) +
                    '/' +
                    (0, utils_1.format_number)(pokemon.length)} - Pages: ${(0, utils_1.format_number)(all_monsters.length)}`, (_a = message.author.avatarURL()) === null || _a === void 0 ? void 0 : _a.toString())
                    .setColor(0xff0000)
                    .setDescription(new_msg);
                yield message.channel
                    .send({ embeds: [embed] })
                    .then(() => {
                    var _a;
                    logger.debug(`Sent Pokémon for ${message.author.username} in ${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
                })
                    .catch((err) => __awaiter(this, void 0, void 0, function* () {
                    logger.error(err);
                }));
            }
            else if (message_contents.length == 0) {
                message.reply(`Cannot find '${search}'.`);
            }
            else {
                const new_msg = message_contents.join('\n');
                const embed = new discord_js_1.MessageEmbed()
                    .setAuthor(`${message.author.username}'s search for '${search}' - Total: ${(0, utils_1.format_number)(message_contents.length) +
                    '/' +
                    (0, utils_1.format_number)(pokemon.length)}`, (_b = message.author.avatarURL()) === null || _b === void 0 ? void 0 : _b.toString())
                    .setColor(0xff0000)
                    .setDescription(new_msg);
                yield message.channel
                    .send({ embeds: [embed] })
                    .then(() => {
                    var _a;
                    logger.debug(`Sent Pokémon for ${message.author.username} in ${(_a = message.guild) === null || _a === void 0 ? void 0 : _a.name}!`);
                })
                    .catch((err) => __awaiter(this, void 0, void 0, function* () {
                    logger.error(err);
                }));
            }
        }
        else {
            message
                .reply(`You don't have any monsters in your Pokédex. :(`)
                .then(() => {
                logger.debug(`${message.author.username} doesn't have any Pokémon!`);
                return;
            })
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                logger.error(err);
            }));
        }
    });
}
exports.searchMonsters = searchMonsters;
