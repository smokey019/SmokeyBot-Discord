import { ColorResolvable, Message, MessageEmbed } from 'discord.js';
import { xp_cache } from '../../clients/cache';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { getCurrentTime, getRndInteger } from '../../utils';
import { getItemDB } from './items';
import {
  findMonsterByID,
  getPokedex,
  getUserMonster,
  IMonsterDex
} from './monsters';
import { rollShiny } from './utils';

const logger = getLogger('ExpGain');

export async function checkExpGain(message: Message): Promise<void> {
  const timestamp = getCurrentTime();
  const cacheKey = message.author.id + ':' + message.guild.id;
  const cache = await xp_cache.get(cacheKey);

  if (cache == undefined) {
    xp_cache.set(cacheKey, getCurrentTime());

    return;
  } else {
    const should_we_exp = getRndInteger(5, 300);
    if (timestamp - parseInt(cache) > should_we_exp) {
      const user = await getUser(message.author.id);
      if (!user) return;
      if (user.current_monster) {
        const monster: IMonsterModel = await getUserMonster(
          user.current_monster,
        );
        const monster_dex: IMonsterDex = await findMonsterByID(
          monster.monster_id,
        );
        const held_item = await getItemDB(monster.held_item);
        xp_cache.set(cacheKey, getCurrentTime());
        if (!monster || monster.level >= 100) return;
        const updateExp = await databaseClient(MonsterTable)
          .where({ id: user.current_monster })
          .increment('experience', getRndInteger(50, 620));
        if (updateExp) {
          logger.trace(
            `User ${message.author.username} gained XP in ${message.guild.name}.`,
          );

          if (monster.experience >= monster.level * 1250 + 1250) {
            const updateLevel = await databaseClient<IMonsterModel>(
              MonsterTable,
            )
              .where({ id: monster.id })
              .increment('level', 1);

            monster.level++;

            if (updateLevel) {
              logger.trace(
                `User ${message.author.username}'s Monster ${monster.id} - ${monster_dex.name.english} has leveled up to ${monster.level}!`,
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
                      title: `${message.author.username}'s ${monster_dex.name.english} is evolving!`,
                    });

                    await message.channel
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
            } else if (
              monster_dex.evoType == 'maxLevel' &&
              monster_dex.name.english == 'Egg' &&
              monster.level === 99
            ) {
              const allMonsters = getPokedex();

              const new_monster: IMonsterDex =
                allMonsters[getRndInteger(0, allMonsters.size - 1)];

              let isShiny = rollShiny();

              // if we're not shiny let's give another chance since hatching an egg
              if (!isShiny) {
                isShiny = rollShiny();
              }

              const updateMonster = await databaseClient<IMonsterModel>(
                MonsterTable,
              )
                .where({ id: monster.id })
                .update({
                  monster_id: new_monster.id,
                  level: 1,
                  experience: getRndInteger(69, 420),
                  shiny: isShiny,
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
                  title: `${message.author.username}'s ${monster_dex.name.english} has hatched!`,
                });

                await message.channel
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
