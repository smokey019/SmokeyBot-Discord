import { Message } from 'discord.js';

import { getCurrentTime, getRndInteger } from '../../utils';
import { getLogger } from '../../clients/logger';
import { ICache, cacheClient } from '../../clients/cache';
import { IMonster } from './monsters';
import { getRandomNature } from './natures';
import { rollShiny, rollLevel } from './utils';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { databaseClient } from '../../clients/database';
import { MonsterUserTable, IMonsterUserModel } from '../../models/MonsterUser';

const logger = getLogger('Pokemon');

/**
 * Returns true if the first value matches any of the currently spawned
 * names. Case insensitive.
 *
 * @param messageContent
 * @param currentSpawn
 */
function monsterMatchesPrevious(messageContent: string, { name }: IMonster) {
  return (
    messageContent ==
      `~catch ${name.english.toLowerCase().replace(/♂|♀/g, '')}` ||
    messageContent ==
      `~キャッチ ${name.japanese.toLowerCase().replace(/♂|♀/g, '')}` ||
    messageContent ==
      `~抓住 ${name.chinese.toLowerCase().replace(/♂|♀/g, '')}` ||
    messageContent ==
      `~capture ${name.french.toLowerCase().replace(/♂|♀/g, '')}`
  );
}

/**
 * Catches a monster.
 *
 * @notes
 * Consider simplifying the parameters. This function should not have to
 * know about `Message` or the entire `cache`. Monster channel missing or
 * don't have a guild ID? Never call this.
 *
 * @notes
 * Each side of this conditional (match vs no match) should probably be
 * broken out into their own functions. `attemptCapture`, `captureFailed`, `captureSuccess`?
 *
 * @param message
 * @param cache
 */
export async function catchMonster(
  message: Message,
  cache: ICache,
): Promise<void> {
  const timestamp = getCurrentTime();

  if (
    cache.monster_spawn.current_spawn &&
    monsterMatchesPrevious(
      message.content.toLowerCase(),
      cache.monster_spawn.current_spawn,
    )
  ) {
    logger.debug(
      `${message.guild?.name} - ${message.author.username} | Starting catch~`,
    );

    const level = rollLevel();
    const shiny = rollShiny();
    const currentSpawn = cache.monster_spawn.current_spawn;

    cache.monster_spawn.last_spawn = cache.monster_spawn.current_spawn;
    cache.monster_spawn.current_spawn = undefined;

    if (message.guild) {
      cacheClient
        .set(message.guild.id, cache)
        .then(() =>
          logger.debug(
            `${message.guild?.name} - ${message.author.username} | Updated cache~`,
          ),
        );
    }

    const monster: IMonsterModel = {
      monster_id: currentSpawn.id,
      hp: getRndInteger(1, 31),
      attack: getRndInteger(1, 31),
      defense: getRndInteger(1, 31),
      sp_attack: getRndInteger(1, 31),
      sp_defense: getRndInteger(1, 31),
      speed: getRndInteger(1, 31),
      nature: getRandomNature(),
      experience: level * 1250,
      level: level,
      uid: message.author.id,
      shiny: shiny,
      mega: 0,
    };

    const averageIV = (
      ((monster.hp +
        monster.attack +
        monster.defense +
        monster.sp_attack +
        monster.sp_defense +
        monster.speed) /
        186) *
      100
    ).toFixed(2);

    logger.debug(
      `${message.guild?.name} - ${message.author.username} | Calculated monster stats, inserting to DB~`,
    );

    try {
      const insertMonster = await databaseClient<IMonsterModel>(MonsterTable)
        .insert(monster)
        .returning('monster_id');

      logger.debug(
        `${message.guild?.name} - ${message.author.username} | Successfully inserted into DB, updating user~`,
      );

      const updateUser = await databaseClient<IMonsterUserModel>(
        MonsterUserTable,
      )
        .where({ uid: message.author.id })
        .update({ latest_monster: insertMonster[0] })
        .returning('uid');

      if (!updateUser[0]) {
        logger.debug(
          `${message.guild?.name} - ${message.author.username} | Couldn't update user, insert to user DB~`,
        );

        await databaseClient<IMonsterUserModel>(MonsterUserTable).insert({
          current_monster: insertMonster[0],
          latest_monster: insertMonster[0],
          uid: message.author.id,
        });

        console.log(`Successfully inserted user ${message.author.username}`);
      }

      if (shiny == 1) {
        // TODO: Implement https://www.npmjs.com/package/i18next or another template string library so the verbiage isn't inlined.
        message.reply(
          `POGGERS! You caught a *SHINY* level ${level} ${currentSpawn.name.english}! Avg IV: ${averageIV}% - ID: ${insertMonster[0]} - Added to Pokédex.`,
        );

        logger.debug(
          `${message.guild?.name} - ${message.author.username} | CAUGHT A RARE POKéMON~`,
        );
      } else {
        message.reply(
          `YOINK! You caught a level ${level} ${currentSpawn.name.english}! Avg IV: ${averageIV}% - ID: ${insertMonster[0]} - Added to Pokédex.`,
        );

        logger.debug(
          `${message.guild?.name} - ${message.author.username} | Caught POKéMON~`,
        );
      }
    } catch (error) {
      logger.error(error);
    }
  } else if (timestamp - (cache?.time || 0) > 5) {
    cache.time = getCurrentTime();

    if (message.guild) {
      cacheClient.set(message.guild.id, cache);
    }

    message
      .reply(`That is the wrong pokémon!`)
      .then(() => logger.debug(`${message.author.username} is WRONG!`))
      .catch(logger.error);
  }
}
