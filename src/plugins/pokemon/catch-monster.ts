import { Message } from 'discord.js';

import { getCurrentTime, getRndInteger, explode } from '../../utils';
import { getLogger } from '../../clients/logger';
import { getGCD, GLOBAL_COOLDOWN } from '../../clients/cache';
import { getRandomNature } from './natures';
import { rollShiny, rollLevel, rollPerfectIV } from './utils';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { databaseClient, getUser } from '../../clients/database';
import { MonsterUserTable, IMonsterUserModel } from '../../models/MonsterUser';
import { userDex } from './info';
import { IMonsterDex } from './monsters';
import { MONSTER_SPAWNS } from './spawn-monster';

const logger = getLogger('Pokemon-Catch');

/**
 * Returns true if the first value matches any of the currently spawned
 * names. Case insensitive.
 *
 * @param messageContent
 * @param currentSpawn
 */
function monsterMatchesPrevious(messageContent: string, { name }: IMonsterDex) {
  const split = explode(messageContent, ' ', 2);
  if (split.length <= 1) return false;
  const monster = split[1].toLowerCase();

  return (
    monster == name.english.toLowerCase().replace(/♂|♀/g, '') ||
    monster == name.japanese.toLowerCase().replace(/♂|♀/g, '') ||
    monster == name.chinese.toLowerCase().replace(/♂|♀/g, '') ||
    monster == name.french.toLowerCase().replace(/♂|♀/g, '')
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
export async function catchMonster(message: Message): Promise<void> {
  const timestamp = getCurrentTime();
  const GCD = await getGCD(message.guild.id);
  const spawn = await MONSTER_SPAWNS.get(message.guild.id);

  if (
    spawn.monster &&
    monsterMatchesPrevious(message.content.toLowerCase(), spawn.monster)
  ) {
    logger.trace(
      `${message.guild?.name} - ${message.author.username} | Starting catch~`,
    );

    let level = 0;

    const shiny = rollShiny();
    const currentSpawn = spawn.monster;

    if (currentSpawn.evoLevel) {
      level = rollLevel(currentSpawn.evoLevel, 60);
    } else {
      level = rollLevel(1, 49);
    }

    spawn.monster = undefined;

    await MONSTER_SPAWNS.set(message.guild.id, spawn);

    const monster: IMonsterModel = {
      monster_id: currentSpawn.id,
      hp: getRndInteger(getRndInteger(1, 3), 31),
      attack: getRndInteger(getRndInteger(1, 3), 31),
      defense: getRndInteger(getRndInteger(1, 3), 31),
      sp_attack: getRndInteger(getRndInteger(1, 3), 31),
      sp_defense: getRndInteger(getRndInteger(1, 3), 31),
      speed: getRndInteger(getRndInteger(1, 3), 31),
      nature: getRandomNature(),
      experience: level * 1250,
      level: level,
      uid: message.author.id,
      original_uid: message.author.id,
      shiny: shiny,
      captured_at: timestamp,
    };

    const isPerfect = rollPerfectIV();

    if (isPerfect) {
      monster.hp = getRndInteger(28, 31);
      monster.attack = getRndInteger(28, 31);
      monster.defense = getRndInteger(28, 31);
      monster.sp_attack = getRndInteger(28, 31);
      monster.sp_defense = getRndInteger(28, 31);
      monster.speed = getRndInteger(28, 31);
    }

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

    try {
      const dex = await userDex(message);

      const insertMonster = await databaseClient<IMonsterModel>(
        MonsterTable,
      ).insert(monster);

      const updateUser = await databaseClient<IMonsterUserModel>(
        MonsterUserTable,
      )
        .where({ uid: message.author.id })
        .update({ latest_monster: insertMonster[0] })
        .increment('currency', 10)
        .increment('streak', 1);

      if (!updateUser) {
        logger.debug(
          `${message.guild?.name} - ${message.author.username} | Couldn't update user, insert to user DB~`,
        );

        await databaseClient<IMonsterUserModel>(MonsterUserTable).insert({
          current_monster: insertMonster[0],
          latest_monster: insertMonster[0],
          uid: message.author.id,
        });

        logger.debug(`Successfully inserted user ${message.author.username}`);
      }

      if (insertMonster) {
        let response = ``;

        if (shiny == 1 && !dex.includes(currentSpawn.id)) {
          response = `_**POGGERS**_! You caught a ⭐__***SHINY***__⭐ level **${level} ${currentSpawn.name.english}**! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}** - Added to Pokédex.`;
          logger.error(
            `${message.guild?.name} - ${message.author.username} | CAUGHT A RARE POKéMON~`,
          );
          await databaseClient<IMonsterUserModel>(MonsterUserTable)
            .where({ uid: message.author.id })
            .increment('currency', 1000);
        } else if (shiny == 0 && !dex.includes(currentSpawn.id)) {
          response = `**YOINK**! You caught a level **${level} ${currentSpawn.name.english}**! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}** - Added to Pokédex.`;
          logger.info(
            `${message.guild?.name} - ${message.author.username} | Caught POKéMON~`,
          );
          await databaseClient<IMonsterUserModel>(MonsterUserTable)
            .where({ uid: message.author.id })
            .increment('currency', 100);
        } else if (shiny == 0 && dex.includes(currentSpawn.id)) {
          response = `**YOINK**! You caught a level **${level} ${currentSpawn.name.english}**! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}**.`;
          logger.info(
            `${message.guild?.name} - ${message.author.username} | Caught POKéMON~`,
          );
        } else if (shiny == 1 && dex.includes(currentSpawn.id)) {
          response = `_**POGGERS**_! You caught a ⭐__***SHINY***__⭐ level **${level} ${currentSpawn.name.english}**! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}**.`;
          logger.error(
            `${message.guild?.name} - ${message.author.username} | CAUGHT A RARE POKéMON~`,
          );
        }

        const user = await getUser(message.author.id);

        if (user) {
          if (user.streak == 10) {
            await databaseClient<IMonsterUserModel>(MonsterUserTable)
              .where({ uid: message.author.id })
              .update({ streak: 0 })
              .increment('currency', 250);
          }
        }

        message.reply(response);
      }
    } catch (error) {
      logger.error(error);
    }
  } else if (timestamp - (GCD || 0) > 5) {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    message
      .reply(`That is the wrong Pokémon!`)
      .then(() => logger.trace(`${message.author.username} is WRONG!`))
      .catch(console.error);
  }
}
