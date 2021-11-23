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
exports.checkExpGain = void 0;
const discord_js_1 = require("discord.js");
const cache_1 = require("../../clients/cache");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const Monster_1 = require("../../models/Monster");
const utils_1 = require("../../utils");
const items_1 = require("./items");
const monsters_1 = require("./monsters");
const logger = (0, logger_1.getLogger)('ExpGain');
function checkExpGain(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const timestamp = (0, utils_1.getCurrentTime)();
        const cacheKey = message.author.id + ':' + message.guild.id;
        const cache = yield cache_1.xp_cache.get(cacheKey);
        if (cache == undefined) {
            yield cache_1.xp_cache.set(cacheKey, (0, utils_1.getCurrentTime)());
            return;
        }
        else {
            const should_we_exp = (0, utils_1.getRndInteger)(5, 300);
            if (timestamp - parseInt(cache) > should_we_exp) {
                const user = yield (0, database_1.getUser)(message.author.id);
                if (!user)
                    return;
                if (user.current_monster) {
                    const monster = yield (0, monsters_1.getUserMonster)(user.current_monster);
                    const monster_dex = yield (0, monsters_1.findMonsterByID)(monster.monster_id);
                    const held_item = yield (0, items_1.getItemDB)(monster.held_item);
                    yield cache_1.xp_cache.set(cacheKey, (0, utils_1.getCurrentTime)());
                    if (!monster || monster.level >= 100)
                        return;
                    const updateExp = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                        .where({ id: user.current_monster })
                        .increment('experience', (0, utils_1.getRndInteger)(50, 620));
                    if (updateExp) {
                        logger.trace(`User ${message.author.username} gained XP in ${message.guild.name}.`);
                        if (monster.experience >= monster.level * 1250 + 1250) {
                            const updateLevel = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                                .where({ id: monster.id })
                                .increment('level', 1);
                            monster.level++;
                            if (updateLevel) {
                                logger.trace(`User ${message.author.username}'s Monster ${monster.id} - ${monster_dex.name.english} has leveled up to ${monster.level}!`);
                            }
                            if (monster_dex.evos && (held_item === null || held_item === void 0 ? void 0 : held_item.item_number) != 229) {
                                const allMonsters = (0, monsters_1.getPokedex)();
                                let evolve = undefined;
                                allMonsters.forEach((element) => __awaiter(this, void 0, void 0, function* () {
                                    if (!element.forme) {
                                        if (element.name.english.toLowerCase() ==
                                            monster_dex.evos[0].toLowerCase()) {
                                            evolve = element;
                                        }
                                    }
                                }));
                                if (evolve && evolve.evoLevel) {
                                    if (monster.level >= evolve.evoLevel) {
                                        const updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                                            .where({ id: monster.id })
                                            .update({ monster_id: evolve.id });
                                        if (updateMonster) {
                                            let imgs = [];
                                            if (monster.shiny) {
                                                imgs = [evolve.images.shiny, monster_dex.images.shiny];
                                            }
                                            else {
                                                imgs = [evolve.images.normal, monster_dex.images.normal];
                                            }
                                            const embed = new discord_js_1.MessageEmbed({
                                                color: evolve.color,
                                                description: `Nice! **${monster_dex.name.english}** has evolved into **${evolve.name.english}**!`,
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
                            }
                        }
                    }
                }
            }
        }
    });
}
exports.checkExpGain = checkExpGain;
