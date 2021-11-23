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
exports.createItemDB = exports.getItemDB = exports.msgBalance = exports.checkItemEvolution = exports.parseItems = exports.itemDB = void 0;
const discord_js_1 = require("discord.js");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const colors_1 = require("../../colors");
const Items_1 = require("../../models/Items");
const Monster_1 = require("../../models/Monster");
const MonsterUser_1 = require("../../models/MonsterUser");
const utils_1 = require("../../utils");
const items_min_json_1 = __importDefault(require("./data/items_min.json"));
const monsters_1 = require("./monsters");
// import MultiMap from 'mnemonist/multi-map';
const parser_1 = require("./parser");
const logger = (0, logger_1.getLogger)('Items');
exports.itemDB = items_min_json_1.default;
function parseItems(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const load_prefixes = yield (0, parser_1.getPrefixes)(message.guild.id);
        const prefixes = RegExp(load_prefixes.join('|'));
        const detect_prefix = message.content.match(prefixes);
        const prefix = detect_prefix.shift();
        const args = message.content
            .slice(prefix.length)
            .trim()
            .toLowerCase()
            .replace(/ {2,}/gm, ' ')
            .split(/ +/);
        const command = args[1];
        if (command == 'buy') {
            yield buyItem(message);
        }
        else if (command == 'remove' || command == '-') {
            yield removeMonsterItem(message);
        }
        else if (command == 'balance') {
            yield msgBalance(message);
        }
        else if (command == 'give' || command == '+') {
            yield giveMonsterItem(message);
        }
        else if (command == 'list' || command == 'items' || command == '=') {
            yield msgUserItems(message);
        }
        else if (command == 'shop') {
            yield listItems(message);
        }
        else if (command == 'update') {
            yield updateItems(message);
        }
    });
}
exports.parseItems = parseItems;
function listItems(message) {
    return __awaiter(this, void 0, void 0, function* () {
        let item_message = [];
        const splitMsg = message.content.split(' ');
        exports.itemDB.forEach((element) => {
            item_message.push(`ID: ${element.id} - Name: ${element.name.english} - Price: ${(0, utils_1.format_number)(element.price)}`);
        });
        let all_items = [];
        if (item_message.length > 10) {
            all_items = (0, utils_1.chunk)(item_message, 10);
            if (splitMsg.length == 3 && all_items.length > 1) {
                const page = parseInt(splitMsg[2]) - 1;
                if (all_items[page]) {
                    item_message = all_items[page];
                }
            }
            else {
                item_message = all_items[0];
            }
        }
        const new_msg = item_message.join('\n');
        const embed = new discord_js_1.MessageEmbed()
            .setAuthor(`Poké Mart`, `https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png`)
            .setColor(0xff0000)
            .setDescription(new_msg);
        yield message.channel
            .send({ embeds: [embed] })
            .then((message) => {
            return message;
        })
            .catch((err) => {
            logger.error(err);
        });
    });
}
function msgUserItems(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const isQuote = message.content.match('"');
        const sort = ['id', 'high'];
        let search = undefined;
        let page = 0;
        const load_prefixes = yield (0, parser_1.getPrefixes)(message.guild.id);
        const prefixes = RegExp(load_prefixes.join('|'));
        const detect_prefix = message.content.match(prefixes);
        const prefix = detect_prefix.shift();
        const args = message.content
            .slice(prefix.length)
            .trim()
            .toLowerCase()
            .replace(/ {2,}/gm, ' ')
            .split(/ +/);
        args.splice(0, 2);
        if (!isNaN(parseInt(args[args.length - 1]))) {
            page = parseInt(args[args.length - 1]);
            args.splice(args.length - 1, 1);
            search = args.join(' ');
        }
        else if (args.length >= 2 && isNaN(parseInt(args[args.length - 1]))) {
            page = 0;
            search = args.join(' ');
        }
        else if (args.includes('evolve')) {
            search = 'Evolve Items';
        }
        else {
            search = args.join(' ');
        }
        const sortable_items = [];
        const items = yield getUserItems(message.author.id);
        if (items && items.length > 0) {
            let item_message = [];
            yield (0, utils_1.asyncForEach)(items, (element) => __awaiter(this, void 0, void 0, function* () {
                const item_dex = getItemByID(element.item_number);
                if (!item_dex)
                    return;
                if ((isQuote &&
                    item_dex.name.english.toLowerCase() != search &&
                    search != 'Evolve Items') ||
                    (args.includes('evolve') &&
                        !(item_dex === null || item_dex === void 0 ? void 0 : item_dex.evolve_item) &&
                        search == 'Evolve Items') ||
                    (search != undefined &&
                        !item_dex.name.english.toLowerCase().match(`${search}`) &&
                        search != 'Evolve Items'))
                    return;
                const tmpMsg = `ID: **${element.id}** - **${item_dex.name.english}** i№: ${item_dex.id}`;
                item_message.push(tmpMsg);
                sortable_items.push({
                    id: element.id,
                    item_number: element.item_number,
                    name: item_dex.name.english,
                    msg: tmpMsg,
                });
            }));
            if (sort[0] == 'number' && sort[1] == 'high') {
                sortable_items.sort(function (a, b) {
                    return b.item_number - a.item_number;
                });
            }
            else if (sort[0] == 'number' && sort[1] == 'low') {
                sortable_items.sort(function (a, b) {
                    return a.item_number - b.item_number;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'high') {
                sortable_items.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            else if (sort[0] == 'id' && sort[1] == 'low') {
                sortable_items.sort(function (a, b) {
                    return a.id - b.id;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'desc') {
                sortable_items.sort(function (a, b) {
                    return b.name - a.name;
                });
            }
            else if (sort[0] == 'name' && sort[1] == 'asc') {
                sortable_items.sort(function (a, b) {
                    return a.name - b.name;
                });
            }
            else {
                sortable_items.sort(function (a, b) {
                    return b.id - a.id;
                });
            }
            yield (0, utils_1.asyncForEach)(sortable_items, (element) => __awaiter(this, void 0, void 0, function* () {
                if (!item_message.includes(element.msg)) {
                    item_message.push(element.msg);
                }
            }));
            if (item_message.length > 10) {
                const all_items = (0, utils_1.chunk)(item_message, 10);
                if (page > 0 && all_items.length > 1) {
                    if (all_items[page]) {
                        item_message = all_items[page];
                        item_message.push(`Page: **${page}/${all_items.length}**`);
                    }
                }
                else {
                    item_message = all_items[0];
                    item_message.push(`Page: **1/${all_items.length}**`);
                }
            }
            const new_msg = item_message.join('\n');
            const embed = new discord_js_1.MessageEmbed()
                .setAuthor(`${message.author.username}'s search for '${search}' \nFound: ${sortable_items.length} \nTotal Items: ${items.length}`, `https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png`)
                .setColor(colors_1.COLOR_BLUE)
                .setDescription(new_msg);
            yield message.channel
                .send({ embeds: [embed] })
                .then((message) => {
                return message;
            })
                .catch((err) => {
                logger.error(err);
            });
        }
    });
}
function updateItems(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(message.author.id);
        const items = JSON.parse(user.items);
        if (items.length > 0) {
            items.forEach((element) => __awaiter(this, void 0, void 0, function* () {
                yield (0, database_1.databaseClient)(Items_1.ItemsTable).insert({
                    item_number: element,
                    uid: message.author.id,
                });
            }));
            yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                .update('items', '[]')
                .where('uid', message.author.id);
            const newItems = yield getUserItems(message.author.id);
            message.reply(`Successfully transferred ${newItems.length} to the new item inventory!`);
            return true;
        }
        else {
            message.reply(`You don't have any old items!`);
            return false;
        }
    });
}
function removeMonsterItem(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(message.author.id);
        const split = (0, utils_1.explode)(message.content, ' ', 3);
        let monster = undefined;
        if (split[2] == 'current') {
            monster = yield (0, monsters_1.getUserMonster)(user.current_monster);
        }
        else {
            monster = yield (0, monsters_1.getUserMonster)(split[2]);
        }
        if (user &&
            split.length == 3 &&
            monster.uid == message.author.id &&
            monster.held_item) {
            const item = yield getItemDB(monster.held_item);
            const itemDex = getItemByID(item.item_number);
            const monsterDex = yield (0, monsters_1.findMonsterByID)(monster.monster_id);
            const updateItem = yield (0, database_1.databaseClient)(Items_1.ItemsTable)
                .where({ id: monster.held_item })
                .update({ held_by: null });
            const updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .where({ id: monster.id })
                .update({ held_item: null });
            if (updateItem && updateMonster) {
                message.reply(`Removed item **${itemDex.name.english}** from **${monsterDex.name.english}**.`);
            }
        }
    });
}
function checkItemEvolution(monster, message, isTrade = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const monster_dex = yield (0, monsters_1.findMonsterByID)(monster.monster_id);
        if ((monster_dex.evos && monster.held_item != 229) ||
            monster_dex.otherFormes) {
            let evolve = undefined;
            const itemDB = yield getItemDB(monster.held_item);
            const item = getItemByID(itemDB.item_number);
            if (monster_dex.evos) {
                monster_dex.evos.forEach((evo) => {
                    const tmpEvo = (0, monsters_1.findMonsterByName)(evo);
                    if (!tmpEvo || !tmpEvo.evoItem)
                        return;
                    if (tmpEvo.evoItem == item.name.english) {
                        evolve = tmpEvo;
                    }
                });
            }
            else if (monster_dex.otherFormes) {
                monster_dex.otherFormes.forEach((evo) => {
                    const tmpEvo = (0, monsters_1.findMonsterByName)(evo);
                    if (!tmpEvo || !tmpEvo.evoItem)
                        return;
                    if (tmpEvo.evoItem == item.name.english) {
                        evolve = tmpEvo;
                    }
                });
            }
            if (evolve != undefined ||
                (evolve === null || evolve === void 0 ? void 0 : evolve.evoItem) == item.name.english ||
                ((evolve === null || evolve === void 0 ? void 0 : evolve.evoType) == 'levelFriendship' && itemDB.item_number == 960) ||
                ((evolve === null || evolve === void 0 ? void 0 : evolve.evoType) == 'trade' && isTrade)) {
                let updateMonster = undefined;
                if (!evolve.forme) {
                    updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                        .where({ id: monster.id })
                        .update({ monster_id: evolve.id, held_item: null });
                }
                else {
                    updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                        .where({ id: monster.id })
                        .update({
                        monster_id: evolve.id,
                        held_item: null,
                    });
                }
                if (updateMonster) {
                    yield deleteItemDB(monster.held_item);
                    let imgs = [];
                    if (monster.shiny) {
                        imgs = [evolve.images.shiny, monster_dex.images.shiny];
                    }
                    else {
                        imgs = [evolve.images.normal, monster_dex.images.normal];
                    }
                    const embed = new discord_js_1.MessageEmbed({
                        color: evolve.color,
                        description: `Nice! **${monster_dex.name.english}** has evolved into **${evolve.name.english}** with held item **${item.name.english}**!`,
                        image: {
                            url: imgs[0],
                        },
                        thumbnail: {
                            url: imgs[1],
                        },
                        title: `${message.author.username}'s ${monster_dex.name.english} is evolving!`,
                    });
                    yield message.channel
                        .send({ embeds: [embed] })
                        .then(() => {
                        return;
                    })
                        .catch((err) => {
                        logger.error(err);
                    });
                }
            }
        }
    });
}
exports.checkItemEvolution = checkItemEvolution;
function giveMonsterItem(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(message.author.id);
        const split = (0, utils_1.explode)(message.content, ' ', 4);
        let monster = undefined;
        if (user && split.length == 4) {
            const item = yield getUserItemDB(parseInt(split[2]), message.author.id);
            if (split[3] == 'current') {
                monster = yield (0, monsters_1.getUserMonster)(user.current_monster);
            }
            else {
                monster = yield (0, monsters_1.getUserMonster)(split[3]);
            }
            if (!monster) {
                message.reply("That monster doesn't exist..");
                return;
            }
            if (item && monster.uid == message.author.id && !monster.held_item) {
                if (item.item_number == 50 && monster.level < 100) {
                    const updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                        .where({ id: monster.id })
                        .increment('level', 1);
                    const deleteItem = yield deleteItemDB(item.id);
                    if (deleteItem && updateMonster) {
                        const itemDex = getItemByID(item.item_number);
                        const monsterDex = yield (0, monsters_1.findMonsterByID)(monster.monster_id);
                        message.reply(`Gave **${monsterDex.name.english}** a **${itemDex.name.english}** and it leveled up! Neato!`);
                    }
                    return;
                }
                else {
                    const updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                        .where({ id: monster.id })
                        .update({ held_item: item.id });
                    const updateItem = yield (0, database_1.databaseClient)(Items_1.ItemsTable)
                        .update('held_by', monster.id)
                        .where({
                        id: item.id,
                    });
                    if (updateItem && updateMonster) {
                        monster.held_item = item.id;
                        const itemDex = getItemByID(item.item_number);
                        const monsterDex = yield (0, monsters_1.findMonsterByID)(monster.monster_id);
                        message.reply(`Gave **${monsterDex.name.english}** an item - **${itemDex.name.english}**! Neato!`);
                        yield checkItemEvolution(monster, message);
                        return;
                    }
                }
            }
        }
    });
}
function buyItem(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(message.author.id);
        const split = (0, utils_1.explode)(message.content, ' ', 3);
        if (user && split.length) {
            const item_to_buy = getItemByID(parseInt(split[split.length - 1])) ||
                getItemByName(split[split.length - 1]);
            if (item_to_buy && user.currency >= item_to_buy.price) {
                const create_item = yield createItemDB({
                    item_number: item_to_buy.id,
                    uid: message.author.id,
                });
                if (create_item) {
                    const updateUser = yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                        .where({ uid: message.author.id })
                        .decrement('currency', item_to_buy.price);
                    if (updateUser) {
                        message.reply(`You have purchased **${item_to_buy.name.english}** for **${(0, utils_1.format_number)(item_to_buy.price)}**! Remaining Balance: **${(0, utils_1.format_number)(user.currency - item_to_buy.price)}**.`);
                    }
                }
            }
        }
    });
}
function msgBalance(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(message.author.id);
        if (user) {
            message.reply(`Your current balance is **${(0, utils_1.format_number)(user.currency)}**.`);
        }
    });
}
exports.msgBalance = msgBalance;
function getItemByName(item) {
    let temp = undefined;
    items_min_json_1.default.forEach((element) => {
        if (element.name.english.toLowerCase() == item.toLowerCase()) {
            temp = element;
        }
    });
    return temp;
}
function getItemByID(item) {
    let temp = undefined;
    items_min_json_1.default.forEach((element) => {
        if (element.id == item) {
            temp = element;
        }
    });
    return temp;
}
function getItemDB(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const item = yield (0, database_1.databaseClient)(Items_1.ItemsTable)
            .first()
            .where('id', id);
        return item;
    });
}
exports.getItemDB = getItemDB;
function getUserItemDB(id, uid) {
    return __awaiter(this, void 0, void 0, function* () {
        const item = yield (0, database_1.databaseClient)(Items_1.ItemsTable).first().where({
            id: id,
            uid: uid,
        });
        return item;
    });
}
function deleteItemDB(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const item = yield (0, database_1.databaseClient)(Items_1.ItemsTable)
            .delete()
            .where('id', id);
        return item;
    });
}
/*async function sellItemDB(
  item_id: number | string,
  uid: number | string,
  currency: number,
): Promise<boolean> {
  const add_currency = await databaseClient<IMonsterUserModel>(MonsterUserTable)
    .where('uid', uid)
    .increment('currency', currency);
  if (add_currency) {
    const deleteItem = await deleteItemDB(item_id);
    if (deleteItem) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}*/
function createItemDB(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const item = yield (0, database_1.databaseClient)(Items_1.ItemsTable).insert(data);
        return item;
    });
}
exports.createItemDB = createItemDB;
function getUserItems(uid) {
    return __awaiter(this, void 0, void 0, function* () {
        const items = yield (0, database_1.databaseClient)(Items_1.ItemsTable)
            .select()
            .where('uid', uid);
        return items;
    });
}
