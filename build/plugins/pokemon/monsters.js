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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unFavorite = exports.setFavorite = exports.selectMonster = exports.getUsersFavoriteMonsters = exports.getUsersMonsters = exports.getUserMonster = exports.getShinyMonsterDBCount = exports.getMonsterDBCount = exports.findMonsterByName = exports.findMonsterByIDLocal = exports.findMonsterByID = exports.findMonsterByID_DB = exports.getRandomMonster = exports.getPokedex = exports.getAllMonsters = exports.MonsterDex = void 0;
const discord_js_1 = require("discord.js");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const Monster_1 = require("../../models/Monster");
const MonsterUser_1 = require("../../models/MonsterUser");
const utils_1 = require("../../utils");
const pokedex_min_json_1 = __importDefault(require("./data/pokedex_min.json"));
const pokemon_list_1 = require("./pokemon-list");
const logger = (0, logger_1.getLogger)('Pokemon');
const MonsterPool = [];
exports.MonsterDex = new discord_js_1.Collection();
let Gens = {
    one: pokemon_list_1.GenerationOne,
    two: pokemon_list_1.GenerationTwo,
    three: pokemon_list_1.GenerationThree,
    four: pokemon_list_1.GenerationFour,
    five: pokemon_list_1.GenerationFive,
    six: pokemon_list_1.GenerationSix,
    seven: pokemon_list_1.GenerationSeven,
    eight: pokemon_list_1.GenerationEight,
    galar: [],
    alola: [],
    extras: pokemon_list_1.GenerationExtras,
};
function formDex() {
    return __awaiter(this, void 0, void 0, function* () {
        logger.info('Forming Pokedex..');
        pokedex_min_json_1.default.forEach((element) => __awaiter(this, void 0, void 0, function* () {
            // !element.forme &&
            if (element.name &&
                element.type &&
                element.images &&
                element.images.normal &&
                !element.name.english.match(/Gmax/)) {
                if (element.forme) {
                    if (!element.forme.match('Mega'))
                        return;
                }
                MonsterPool.push(element.id);
                if (element.region == 'Alola') {
                    Gens.alola.push(element);
                }
                if (element.region == 'Galar') {
                    Gens.galar.push(element);
                }
            }
            if (element.name.english &&
                element.images &&
                element.images.normal &&
                !element.name.english.match(/Gmax/)) {
                exports.MonsterDex.set(element.id, element);
                /*await databaseClient('pokedex').insert({
                          pokemon_id: element.id || null,
                          name: JSON.stringify(element.name) || null,
                          type: JSON.stringify(element.type) || null,
                          genderRatio: JSON.stringify(element.genderRatio) || null,
                          baseStats: JSON.stringify(element.baseStats) || null,
                          abilities: JSON.stringify(element.abilities) || null,
                          heightm: element.heightm || null,
                          weightkg: element.weightkg || null,
                          color: element.color || null,
                          evos: JSON.stringify(element.evos) || null,
                          eggGroups: JSON.stringify(element.eggGroups) || null,
                          images: JSON.stringify(element.images) || null,
                          forme: element.forme || null,
                          region: element.region || null,
                          special: element.special || null,
                          prevo: element.prevo || null,
                          evoItem: element.evoItem || null,
                          evoType: element.evoType || null,
                          evoLevel: element.evoLevel || null,
                          evoCondition: element.evoCondition || null,
                          otherFormes: JSON.stringify(element.otherFormes) || null,
                          baseForme: element.baseForme || null,
                          formeOrder: JSON.stringify(element.formeOrder) || null,
                          gender: element.gender || null,
                          cosmeticFormes: JSON.stringify(element.cosmeticFormes) || null,
                      });*/
            }
        }));
        /**
         * Specific Monster Boosts
         */
        for (let index = 0; index < 150; index++) {
            MonsterPool.push(1);
            MonsterPool.push(4);
            MonsterPool.push(7);
            MonsterPool.push(1);
            MonsterPool.push(29);
            MonsterPool.push(32);
            MonsterPool.push(111);
            MonsterPool.push(133);
            MonsterPool.push(143);
            MonsterPool.push(149);
        }
        for (let index = 0; index < 2; index++) {
            Gens.one.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.two.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.three.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.four.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.five.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.six.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.seven.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.eight.forEach((element) => {
                MonsterPool.push(element);
                MonsterPool.push(element);
            });
            Gens.alola.forEach((element) => {
                MonsterPool.push(element.id);
                MonsterPool.push(element.id);
            });
            Gens.galar.forEach((element) => {
                MonsterPool.push(element.id);
                MonsterPool.push(element.id);
            });
        }
        /**
         * clear to save some memory
         */
        Gens = undefined;
        logger.info('Finished forming Pokedex.');
    });
}
/**
 * have to do this inside of a function :)
 * (not anymore but it's ok)
 */
formDex();
/**
 * return monster spawn pool
 */
function getAllMonsters() {
    return MonsterPool;
}
exports.getAllMonsters = getAllMonsters;
/**
 * return pokedex Collection
 */
function getPokedex() {
    return exports.MonsterDex;
}
exports.getPokedex = getPokedex;
/**
 * get a random monster from the spawn pool
 */
function getRandomMonster() {
    return MonsterPool[(0, utils_1.getRndInteger)(0, MonsterPool.length - 1)];
}
exports.getRandomMonster = getRandomMonster;
/**
 * get monster's dex info by it's number
 * @param id monster number
 */
function findMonsterByID_DB(id) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, utils_1.jsonFetch)(`https://api.smokey.gg/pokemon/pokedex/${id}`);
    });
}
exports.findMonsterByID_DB = findMonsterByID_DB;
/**
 * get monster's dex info by it's number
 * @param id monster number
 */
function findMonsterByID(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const monster = exports.MonsterDex.find((mon) => mon.id === id);
        return monster;
    });
}
exports.findMonsterByID = findMonsterByID;
function findMonsterByIDLocal(id) {
    return exports.MonsterDex.get(id);
}
exports.findMonsterByIDLocal = findMonsterByIDLocal;
/**
 * find monster by it's name
 * @param name
 */
function findMonsterByName(name) {
    if (!name)
        return undefined;
    let monster = undefined;
    exports.MonsterDex.forEach((element) => __awaiter(this, void 0, void 0, function* () {
        if (element.name.english.toLowerCase().replace(/♂|♀/g, '') ==
            name.toLowerCase()) {
            monster = element;
        }
    }));
    return monster;
}
exports.findMonsterByName = findMonsterByName;
/**
 * return total monster count for stats
 */
function getMonsterDBCount() {
    return __awaiter(this, void 0, void 0, function* () {
        const db_monster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable).select('id');
        return db_monster.length;
    });
}
exports.getMonsterDBCount = getMonsterDBCount;
/**
 * return total shiny monster count for stats
 */
function getShinyMonsterDBCount() {
    return __awaiter(this, void 0, void 0, function* () {
        const db_monster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select('id')
            .where('shiny', 1);
        return db_monster.length;
    });
}
exports.getShinyMonsterDBCount = getShinyMonsterDBCount;
/**
 * return user's monster database info
 * @param monster_id database id
 */
function getUserMonster(monster_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db_monster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where('id', monster_id);
        if (db_monster) {
            return db_monster[0];
        }
        else {
            return undefined;
        }
    });
}
exports.getUserMonster = getUserMonster;
/**
 * Get a user's monsters
 * @param uid Discord ID
 * @param released 0 | 1, default 0
 * @returns IMonsterModel[]
 */
function getUsersMonsters(uid, released) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!released)
            released = 0;
        const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where({
            uid: uid,
            released: released,
        });
        return monsters;
    });
}
exports.getUsersMonsters = getUsersMonsters;
/**
 * Get a user's favorite monsters.
 * @param uid Discord ID
 * @param released 0 | 1, default 0
 * @returns IMonsterModel[]
 */
function getUsersFavoriteMonsters(uid, released) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!released)
            released = 0;
        const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where({
            uid: uid,
            released: released,
            favorite: 1
        });
        return monsters;
    });
}
exports.getUsersFavoriteMonsters = getUsersFavoriteMonsters;
function selectMonster(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const splitMsg = message.content.split(' ');
        const monster = yield getUserMonster(splitMsg[1]);
        if (!monster)
            return undefined;
        const dex = yield findMonsterByID(monster.monster_id);
        if (monster && message.author.id == monster.uid) {
            const updateUser = yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                .where({ uid: message.author.id })
                .update({ current_monster: parseInt(splitMsg[1]) });
            if (updateUser) {
                message.reply(`Selected **Level ${monster.level} ${dex.name.english}**!`);
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    });
}
exports.selectMonster = selectMonster;
function setFavorite(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const splitMsg = message.content.split(' ');
        const monster = yield getUserMonster(splitMsg[1]);
        if (!monster)
            return undefined;
        const dex = yield findMonsterByID(monster.monster_id);
        if (monster && message.author.id == monster.uid) {
            const updatedMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .where('id', monster.id)
                .update({ favorite: 1 });
            if (updatedMonster) {
                message.reply(`Favorited monster **Level ${monster.level} ${dex.name.english}**!`);
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    });
}
exports.setFavorite = setFavorite;
function unFavorite(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const splitMsg = message.content.split(' ');
        const monster = yield getUserMonster(splitMsg[1]);
        if (monster && message.author.id == monster.uid) {
            const updatedMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .where('id', monster.id)
                .update({ favorite: 0 });
            if (updatedMonster) {
                message.reply(`Unfavorited monster id ${monster.id}!`);
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    });
}
exports.unFavorite = unFavorite;
