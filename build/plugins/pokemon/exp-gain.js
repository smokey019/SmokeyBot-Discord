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
const queue_1 = require("../../clients/queue");
const Monster_1 = require("../../models/Monster");
const utils_1 = require("../../utils");
const items_1 = require("./items");
const monsters_1 = require("./monsters");
const utils_2 = require("./utils");
const logger = (0, logger_1.getLogger)('ExpGain');
function checkExpGain(user, guild, interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const timestamp = (0, utils_1.getCurrentTime)();
        const cacheKey = user.id + ':' + guild.id;
        const cache = yield cache_1.xp_cache.get(cacheKey);
        if (cache == undefined) {
            cache_1.xp_cache.set(cacheKey, (0, utils_1.getCurrentTime)());
            return;
        }
        else {
            const should_we_exp = (0, utils_1.getRndInteger)(5, 300);
            if (timestamp - parseInt(cache) > should_we_exp) {
                const tmpUser = yield (0, database_1.getUser)(user.id);
                if (!tmpUser)
                    return;
                if (tmpUser.current_monster) {
                    const monster = yield (0, monsters_1.getUserMonster)(tmpUser.current_monster);
                    const monster_dex = yield (0, monsters_1.findMonsterByID)(monster.monster_id);
                    const held_item = yield (0, items_1.getItemDB)(monster.held_item);
                    cache_1.xp_cache.set(cacheKey, (0, utils_1.getCurrentTime)());
                    if (!monster || monster.level >= 100)
                        return;
                    const updateExp = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                        .where({ id: tmpUser.current_monster })
                        .increment('experience', (0, utils_1.getRndInteger)(50, 620));
                    if (updateExp) {
                        logger.trace(`User ${user.username} gained XP in ${guild.name}.`);
                        if (monster.experience >= monster.level * 1250) {
                            const updateLevel = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                                .where({ id: monster.id })
                                .increment('level', 1);
                            monster.level++;
                            if (updateLevel) {
                                logger.trace(`User ${user.username}'s Monster ${monster.id} - ${monster_dex.name.english} has leveled up to ${monster.level}!`);
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
                                                title: `${user.username}'s ${monster_dex.name.english} is evolving!`,
                                            });
                                            if (interaction) {
                                                (0, queue_1.queueMsg)(embed, interaction, false, 0, undefined, true);
                                            }
                                        }
                                    }
                                }
                            }
                            else if (monster_dex.evoType == 'maxLevel' &&
                                monster_dex.name.english == 'Egg' &&
                                monster.level >= 50) {
                                let new_monster = yield (0, monsters_1.findMonsterByID)((0, monsters_1.getRandomMonster)());
                                while (new_monster.name.english == "Egg") {
                                    new_monster = yield (0, monsters_1.findMonsterByID)((0, monsters_1.getRandomMonster)());
                                }
                                let isShiny = (0, utils_2.rollShiny)();
                                // if we're not shiny let's give another chance since hatching an egg
                                if (!isShiny && !monster.shiny) {
                                    isShiny = (0, utils_2.rollShiny)();
                                }
                                else if (monster.shiny) {
                                    isShiny = 1;
                                }
                                const updateMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                                    .where({ id: monster.id })
                                    .update({
                                    monster_id: new_monster.id,
                                    level: (0, utils_1.getRndInteger)(1, 5),
                                    experience: (0, utils_1.getRndInteger)(69, 420),
                                    shiny: isShiny,
                                    hatched_at: Date.now(),
                                });
                                if (updateMonster) {
                                    let imgs = [];
                                    if (monster.shiny) {
                                        imgs = [new_monster.images.shiny, monster_dex.images.shiny];
                                    }
                                    else {
                                        imgs = [new_monster.images.normal, monster_dex.images.normal];
                                    }
                                    const embed = new discord_js_1.MessageEmbed({
                                        color: new_monster.color,
                                        description: `YO! **${monster_dex.name.english}** has HATCHED into **${new_monster.name.english}**! Congratulations!`,
                                        image: {
                                            url: imgs[0],
                                        },
                                        thumbnail: {
                                            url: imgs[1],
                                        },
                                        title: `${user.username}'s ${monster_dex.name.english} has hatched!`,
                                    });
                                    if (interaction) {
                                        (0, queue_1.queueMsg)(embed, interaction, false, 0, undefined, true);
                                    }
                                }
                                else {
                                    console.error('there was an error updating the egg>monster');
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
