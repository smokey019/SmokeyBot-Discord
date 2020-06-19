import { Message, MessageEmbed } from 'discord.js';
import { getCurrentTime, getRndInteger } from '../../utils';
import { xp_cache } from '../../clients/cache';
import { getMonsterUser, databaseClient } from '../../clients/database';
import { MonsterTable, IMonsterModel } from '../../models/Monster';
import { getLogger } from '../../clients/logger';
import {
  getUserMonster,
  findMonsterByID,
  IMonsterDex,
  getAllMonsters,
} from './monsters';

const logger = getLogger('ExpGain');

export async function checkExpGain(message: Message): Promise<any> {
  const timestamp = getCurrentTime();
  const cacheKey = message.author.id + ':' + message.guild.id;
  const cache = await xp_cache.get(cacheKey);

  if (cache == undefined) {
    await xp_cache.set(cacheKey, getCurrentTime());

    return;
  } else {
    const should_we_exp = getRndInteger(5, 600);
    if (timestamp - parseInt(cache) > should_we_exp) {
      const user = await getMonsterUser(message.author.id);
      if (!user) return;
      if (user.current_monster) {
        const monster: IMonsterModel = await getUserMonster(
          user.current_monster,
        );
        const monster_dex: IMonsterDex = findMonsterByID(monster.monster_id);
        await xp_cache.set(cacheKey, getCurrentTime());
        const updateExp = await databaseClient(MonsterTable)
          .where({ id: user.current_monster })
          .increment('experience', getRndInteger(25, 420));
        if (updateExp && monster && monster.level < 100) {
          logger.info(
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
              logger.debug(
                `User ${message.author.username}'s Monster ${monster.id} - ${monster_dex.name.english} has leveled up to ${monster.level}!`,
              );
            }
          }

          if (monster_dex.evos) {
            console.log('evo:', monster_dex.evos[0]);
            const allMonsters = getAllMonsters();

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
            const tmpID = `${evolve.id}`.padStart(3, '0');
            const img = `https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`;

            if (evolve.evoLevel) {
              if (monster.level >= evolve.evoLevel) {
                const updateMonster = await databaseClient<IMonsterModel>(
                  MonsterTable,
                )
                  .where({ id: monster.id })
                  .update({ monster_id: evolve.id });

                if (updateMonster) {
                  const embed = new MessageEmbed({
                    color: 0x00bc8c,
                    description: `Nice! **${monster_dex.name.english}** has evolved into **${evolve.name.english}**!`,
                    image: {
                      url: img,
                    },
                    thumbnail: {
                      url: monster_dex.images.normal,
                    },
                    title: `${message.author.username}'s ${monster_dex.name.english} is evolving!`,
                  });

                  await message.channel
                    .send(embed)
                    .then(() => {
                      return;
                    })
                    .catch(console.error);
                }
              }
            }
          }
        }
      }
    }
  }
}
