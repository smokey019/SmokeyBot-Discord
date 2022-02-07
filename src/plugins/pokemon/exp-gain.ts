import { ColorResolvable, CommandInteraction, Guild, MessageEmbed, User } from 'discord.js';
import { xp_cache } from '../../clients/cache';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { getCurrentTime, getRndInteger } from '../../utils';
import { getItemDB } from './items';
import {
  findMonsterByID,
  getPokedex,
  getRandomMonster,
  getUserMonster,
  IMonsterDex
} from './monsters';
import { rollShiny } from './utils';

const logger = getLogger('ExpGain');

export async function checkExpGain(user: User, guild: Guild, interaction?: CommandInteraction): Promise<void> {
  const timestamp = getCurrentTime();
  const cacheKey = user.id + ':' + guild.id;
  const cache = await xp_cache.get(cacheKey);

  if (cache == undefined) {
    xp_cache.set(cacheKey, getCurrentTime());

    return;
  } else {
    const should_we_exp = getRndInteger(5, 300);
    if (timestamp - parseInt(cache) > should_we_exp) {
      const tmpUser = await getUser(user.id);
      if (!tmpUser) return;
      if (tmpUser.current_monster) {
        const monster: IMonsterModel = await getUserMonster(
          tmpUser.current_monster,
        );
        const monster_dex: IMonsterDex = await findMonsterByID(
          monster.monster_id,
        );
        const held_item = await getItemDB(monster.held_item);
        xp_cache.set(cacheKey, getCurrentTime());
        if (!monster || monster.level >= 100) return;
        const updateExp = await databaseClient(MonsterTable)
          .where({ id: tmpUser.current_monster })
          .increment('experience', getRndInteger(50, 620));
        if (updateExp) {
          logger.trace(
            `User ${user.username} gained XP in ${guild.name}.`,
          );

          if (monster.experience >= monster.level * 1250) {
            const updateLevel = await databaseClient<IMonsterModel>(
              MonsterTable,
            )
              .where({ id: monster.id })
              .increment('level', 1);

            monster.level++;

            if (updateLevel) {
              logger.trace(
                `User ${user.username}'s Monster ${monster.id} - ${monster_dex.name.english} has leveled up to ${monster.level}!`,
              );
            }

            if (monster_dex.evos && held_item?.item_number != 229) {
              const allMonsters = getPokedex();

              let evolve = undefined;
              allMonsters.forEach(async (element) => {
                if (!element.forme) {
                  if (
                    element.name.english.toLowerCase() ==
                    monster_dex.evos[0].toLowerCase()
                  ) {
                    evolve = element;
                  }
                }
              });

              if (evolve && evolve.evoLevel) {
                if (monster.level >= evolve.evoLevel) {
                  const updateMonster = await databaseClient<IMonsterModel>(
                    MonsterTable,
                  )
                    .where({ id: monster.id })
                    .update({ monster_id: evolve.id });

                  if (updateMonster) {
                    let imgs = [];
                    if (monster.shiny) {
                      imgs = [evolve.images.shiny, monster_dex.images.shiny];
                    } else {
                      imgs = [evolve.images.normal, monster_dex.images.normal];
                    }
                    const embed = new MessageEmbed({
                      color: evolve.color as ColorResolvable,
                      description: `Nice! **${monster_dex.name.english}** has evolved into **${evolve.name.english}**!`,
                      image: {
                        url: imgs[0],
                      },
                      thumbnail: {
                        url: imgs[1],
                      },
                      title: `${user.username}'s ${monster_dex.name.english} is evolving!`,
                    });

                    if (interaction){
                      queueMsg(embed, interaction, false, 0, undefined, true);
                    }
                  }
                }
              }
            } else if (
              monster_dex.evoType == 'maxLevel' &&
              monster_dex.name.english == 'Egg' &&
              monster.level >= 50
            ) {
              let new_monster = await findMonsterByID(getRandomMonster());

              while (new_monster.name.english == "Egg") {
                new_monster = await findMonsterByID(getRandomMonster());
              }

              let isShiny = rollShiny();

              // if we're not shiny let's give another chance since hatching an egg
              if (!isShiny && !monster.shiny) {
                isShiny = rollShiny();
              } else if (monster.shiny) {
                isShiny = 1;
              }

              const updateMonster = await databaseClient<IMonsterModel>(
                MonsterTable,
              )
                .where({ id: monster.id })
                .update({
                  monster_id: new_monster.id,
                  level: getRndInteger(1, 5),
                  experience: getRndInteger(69, 420),
                  shiny: isShiny,
                  hatched_at: Date.now(),
                });

              if (updateMonster) {
                let imgs = [];
                if (monster.shiny) {
                  imgs = [new_monster.images.shiny, monster_dex.images.shiny];
                } else {
                  imgs = [new_monster.images.normal, monster_dex.images.normal];
                }
                const embed = new MessageEmbed({
                  color: new_monster.color as ColorResolvable,
                  description: `YO! **${monster_dex.name.english}** has HATCHED into **${new_monster.name.english}**! Congratulations!`,
                  image: {
                    url: imgs[0],
                  },
                  thumbnail: {
                    url: imgs[1],
                  },
                  title: `${user.username}'s ${monster_dex.name.english} has hatched!`,
                });

                if (interaction){
                  queueMsg(embed, interaction, false, 0, undefined, true);
                }
              } else {
                console.error('there was an error updating the egg>monster');
              }
            }
          }
        }
      }
    }
  }
}
