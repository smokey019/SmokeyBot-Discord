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
exports.checkTrade = exports.cancelTrade = exports.confirmTrade = exports.checkEvolves = exports.parseTrade = exports.startTrade = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const discord_js_1 = require("discord.js");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const queue_1 = require("../../clients/queue");
const colors_1 = require("../../colors");
const Monster_1 = require("../../models/Monster");
const MonsterUser_1 = require("../../models/MonsterUser");
const Trades_1 = require("../../models/Trades");
const utils_1 = require("../../utils");
const items_1 = require("./items");
const monsters_1 = require("./monsters");
const logger = (0, logger_1.getLogger)('Pokémon-Trade');
function startTrade(interaction, args) {
    return __awaiter(this, void 0, void 0, function* () {
        // ~trade start @mention id-for-monster
        const split = args;
        const traded_monster = parseInt(split[2]);
        const to_user = interaction.options.getMentionable('player');
        if (to_user) {
            if (to_user == interaction.user.id)
                return;
            const recipient = yield (0, database_1.getUser)(to_user);
            const check_trade = yield checkTrade(traded_monster, to_user, interaction);
            if (recipient && !check_trade) {
                const insertTrade = yield (0, database_1.databaseClient)(Trades_1.TradeTable).insert({
                    monster_id: traded_monster,
                    uid_from: interaction.user.id,
                    uid_to: to_user,
                    active: 1,
                    traded: 0,
                    timestamp: (0, utils_1.getCurrentTime)(),
                });
                if (insertTrade) {
                    const monsterDB = yield (0, monsters_1.getUserMonster)(traded_monster);
                    const monster = yield (0, monsters_1.findMonsterByID)(monsterDB.monster_id);
                    const imgs = [];
                    if (monsterDB.shiny) {
                        imgs[0] = monster.images.shiny;
                        imgs[1] = monster.images['gif-shiny'];
                    }
                    else {
                        imgs[0] = monster.images.normal;
                        imgs[1] = monster.images.gif;
                    }
                    const iv_avg = ((monsterDB.hp +
                        monsterDB.attack +
                        monsterDB.defense +
                        monsterDB.sp_attack +
                        monsterDB.sp_defense +
                        monsterDB.speed) /
                        186) *
                        100;
                    const embed = new discord_js_1.MessageEmbed({
                        color: colors_1.COLOR_BLUE,
                        description: `Successfully initiated trade with <@${to_user}>\nIf they want to accept the trade type ~trade accept!\n\n**Average IV:** ${iv_avg.toFixed(2)}%`,
                        image: {
                            url: imgs[0],
                        },
                        thumbnail: {
                            url: imgs[1],
                        },
                        title: `Trading ${monster.name.english}..`,
                    });
                    yield interaction.channel
                        .send({ embeds: [embed] })
                        .then(() => {
                        return;
                    })
                        .catch((err) => {
                        logger.error(err);
                    });
                }
                else {
                    logger.error(`DB error while inserting trade.`);
                }
            }
            else if (!recipient) {
                interaction.reply(`Could not find user <@${to_user}>, make them catch a Pokémon first!`);
            }
            else if (check_trade) {
                interaction.reply(`A trade with this Pokémon or user exists already. Close that one and try again.`);
            }
        }
        else {
            interaction.reply(`You need to mention someone m8.`);
        }
    });
}
exports.startTrade = startTrade;
function parseTrade(interaction, args) {
    return __awaiter(this, void 0, void 0, function* () {
        // ~trade start @mention id-for-monster
        const command = interaction.commandName;
        if (command == 'start') {
            yield startTrade(interaction, args);
        }
        else if (command == 'cancel' ||
            command == 'delete' ||
            command == 'del' ||
            command == '-') {
            yield cancelTrade(interaction);
        }
        else if (command == 'accept' ||
            command == 'confirm' ||
            command == 'acc' ||
            command == '+') {
            yield confirmTrade(interaction);
        }
    });
}
exports.parseTrade = parseTrade;
function checkEvolves(monster_id, interaction) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const db_monster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where({
            id: monster_id,
        });
        if (db_monster.length) {
            const monster = yield (0, monsters_1.findMonsterByID)(db_monster[0].monster_id);
            const item = (_a = (yield (0, items_1.getItemDB)(db_monster[0].held_item))) !== null && _a !== void 0 ? _a : undefined;
            if (monster.evos) {
                if (item) {
                    if (item.item_number == 229)
                        return false;
                }
                const evolution = (0, monsters_1.findMonsterByName)(monster.evos[0]);
                if (evolution) {
                    if (evolution.evoType) {
                        if (evolution.evoType == 'trade' && !evolution.evoItem) {
                            const updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                                .where({ id: db_monster[0].id })
                                .update({ monster_id: evolution.id });
                            if (updateMonster) {
                                let imgs = [];
                                if (db_monster[0].shiny) {
                                    imgs = [evolution.images.shiny, monster.images.shiny];
                                }
                                else {
                                    imgs = [evolution.images.normal, monster.images.normal];
                                }
                                const embed = new discord_js_1.MessageEmbed({
                                    color: 0x00bc8c,
                                    description: `Nice! **${monster.name.english}** has evolved into **${evolution.name.english}** via trade!`,
                                    image: {
                                        url: imgs[0],
                                    },
                                    thumbnail: {
                                        url: imgs[1],
                                    },
                                    title: `${interaction.user.username}'s ${monster.name.english} is evolving!`,
                                });
                                (0, queue_1.queueMsg)(embed, interaction);
                            }
                            else {
                                return false;
                            }
                        }
                        else if (evolution.evoType == 'trade' && evolution.evoItem) {
                            (0, items_1.checkItemEvolution)(db_monster[0], interaction, true);
                        }
                        else {
                            return false;
                        }
                    }
                    else {
                        return false;
                    }
                }
                else {
                    return false;
                }
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
exports.checkEvolves = checkEvolves;
function confirmTrade(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        // ~trade accept
        const trades = yield (0, database_1.databaseClient)(Trades_1.TradeTable).select().where({
            uid_to: interaction.user.id,
            active: 1,
        });
        if (trades.length) {
            const trade = trades[0];
            const updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .where({ id: trade.monster_id })
                .update({ uid: interaction.user.id, favorite: 0 });
            if (updateMonster) {
                const monsterDB = yield (0, monsters_1.getUserMonster)(trade.monster_id);
                const monster = yield (0, monsters_1.findMonsterByID)(monsterDB.monster_id);
                interaction.reply(`Successfully traded over monster **${monster.name.english}**! Nice dude.`);
                yield checkEvolves(trade.monster_id, interaction);
                yield (0, database_1.databaseClient)(Trades_1.TradeTable)
                    .where({ id: trade.id })
                    .update({ active: 0, traded: 1 });
                yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                    .where({ uid: interaction.user.id })
                    .update({ latest_monster: trade.monster_id });
            }
            else {
                logger.error(`There was an error updating monster ${trade.monster_id} for a trade.`);
            }
        }
        else {
            interaction.reply(`You don't have any trades to accept m8.`);
        }
    });
}
exports.confirmTrade = confirmTrade;
function cancelTrade(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const trades = yield (0, database_1.databaseClient)(Trades_1.TradeTable)
            .select()
            .where({
            uid_to: interaction.user.id,
            active: 1,
        })
            .orWhere({
            uid_from: interaction.user.id,
            active: 1,
        });
        if (trades.length) {
            const trade = trades[0];
            const cancelTrade = yield (0, database_1.databaseClient)(Trades_1.TradeTable)
                .where({ id: trade.id })
                .update({ active: 0 });
            if (cancelTrade) {
                interaction.reply(`Successfully cancelled trade with monster #${trade.monster_id}.`);
            }
        }
        else {
            interaction.reply(`You don't have any trades to cancel m8.`);
        }
    });
}
exports.cancelTrade = cancelTrade;
function checkTrade(monster_id, to_user, interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const trades = yield (0, database_1.databaseClient)(Trades_1.TradeTable).select().where({
            monster_id: monster_id,
            active: 1,
        });
        const pokemon = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where({
            id: monster_id,
        });
        const users = yield (0, database_1.databaseClient)(Trades_1.TradeTable).select().where({
            uid_to: to_user,
            uid_from: interaction.user.id,
            active: 1,
        });
        if (trades.length ||
            users.length ||
            pokemon.length == 0 ||
            pokemon[0].uid != interaction.user.id) {
            return true;
        }
        else {
            return false;
        }
    });
}
exports.checkTrade = checkTrade;
