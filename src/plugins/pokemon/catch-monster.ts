import { Message, MessageEmbed } from 'discord.js';
import { getGCD, GLOBAL_COOLDOWN, ICache } from '../../clients/cache';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { COLOR_PURPLE } from '../../colors';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { explode, getCurrentTime, getRndInteger } from '../../utils';
import { userDex } from './info';
import { IMonsterDex } from './monsters';
import { getRandomNature } from './natures';
import { MONSTER_SPAWNS } from './spawn-monster';
import { rollGender, rollLevel, rollPerfectIV, rollShiny } from './utils';

const logger = getLogger('Pokemon-Catch');

/**
 * Returns true if the first value matches any of the currently spawned
 * names. Case insensitive.
 *
 * @param messageContent
 * @param currentSpawn
 */
function monsterMatchesPrevious(messageContent: string, { name }: IMonsterDex) {
  const split = explode(messageContent.replace(/ {2,}/gm, ' '), ' ', 2);
  if (split.length <= 1) return false;
  const monster = split[1].toLowerCase();

  return (
    monster ==
      name.english
        .replace(/(♂|♀| RS| SS|Galarian |Alolan )/gi, '')
        .toLowerCase() ||
    monster ==
      name.japanese
        .replace(/(♂|♀| RS| SS|Galarian |Alolan )/gi, '')
        .toLowerCase() ||
    monster == name.chinese.toLowerCase().replace(/♂|♀/g, '') ||
    monster == name.french.toLowerCase().replace(/♂|♀/g, '') ||
    monster == name.english.toLowerCase() ||
    monster == name.japanese.toLowerCase()
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
    let gender = rollGender();
    const currentSpawn: IMonsterDex = spawn.monster;

    if (currentSpawn.evoLevel) {
      level = rollLevel(currentSpawn.evoLevel, 60);
    } else {
      level = rollLevel(1, 49);
    }

    if (currentSpawn.gender == 'N') {
      gender = 'N';
    }

    spawn.monster = null;

    await MONSTER_SPAWNS.set(message.guild.id, spawn);

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
      original_uid: message.author.id,
      shiny: shiny,
      captured_at: timestamp,
      gender: gender,
    };

    const isPerfect = rollPerfectIV();

    if (isPerfect) {
      monster.hp = getRndInteger(28, 31);
      monster.attack = getRndInteger(28, 31);
      monster.defense = getRndInteger(28, 31);
      monster.sp_attack = getRndInteger(28, 31);
      monster.sp_defense = getRndInteger(28, 31);
      monster.speed = getRndInteger(28, 31);
      monster.avg_iv = parseFloat(
        (
          ((monster.hp +
            monster.attack +
            monster.defense +
            monster.sp_attack +
            monster.sp_defense +
            monster.speed) /
            186) *
          100
        ).toFixed(2),
      );
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

    monster.avg_iv = parseFloat(averageIV);

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
          dex: '[]',
        });

        logger.debug(`Successfully inserted user ${message.author.username}`);
      }

      if (insertMonster) {
        const random_grats = ['YOINK', 'YOINKERS', 'NICE', 'NOICE', 'Congrats'];
        let response = ``;
        let shiny_msg = '';
        let legendary = '';

        if (shiny) {
          shiny_msg = ' ⭐';
        } else {
          shiny_msg = '';
        }

        currentSpawn.id = parseFloat(currentSpawn.id.toString());

        if (currentSpawn.special) {
          legendary = ` 💠`;
        } else {
          legendary = '';
        }

        if (shiny == 1 && !dex.includes(currentSpawn.id)) {
          response = `_**POGGERS**_! You caught a __***SHINY***__ level **${level} ${
            currentSpawn.name.english
          }**${shiny_msg + legendary}! \n\n Avg IV: **${averageIV}**% \nID: **${
            insertMonster[0]
          }** \n\nAdded to Pokédex.`;
          logger.error(
            `'${message.guild?.name}' - Caught A SHINY POKéMON~ -> '${message.author.username}'`,
          );
          await databaseClient<IMonsterUserModel>(MonsterUserTable)
            .where({ uid: message.author.id })
            .increment('currency', 1000);
        } else if (shiny == 0 && !dex.includes(currentSpawn.id)) {
          response = `**${
            random_grats[getRndInteger(0, random_grats.length - 1)]
          }**! You caught a level **${level} ${currentSpawn.name.english}**${
            shiny_msg + legendary
          }! Avg IV: **${averageIV}**% - ID: **${
            insertMonster[0]
          }** - Added to Pokédex.`;
          logger.info(
            `'${message.guild?.name}' - Caught POKéMON~ -> '${message.author.username}'`,
          );
          await databaseClient<IMonsterUserModel>(MonsterUserTable)
            .where({ uid: message.author.id })
            .increment('currency', 100);
        } else if (shiny == 0 && dex.includes(currentSpawn.id)) {
          response = `**${
            random_grats[getRndInteger(0, random_grats.length - 1)]
          }**! You caught a level **${level} ${currentSpawn.name.english}**${
            shiny_msg + legendary
          }! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}**.`;
          logger.info(
            `'${message.guild?.name}' - Caught POKéMON~ -> '${message.author.username}'`,
          );
        } else if (shiny == 1 && dex.includes(currentSpawn.id)) {
          response = `_**POGGERS**_! You caught a __***SHINY***__ level **${level} ${
            currentSpawn.name.english
          }${shiny_msg + legendary}**! \n\n Avg IV: **${averageIV}**% \nID: **${
            insertMonster[0]
          }**.`;
          logger.error(
            `'${message.guild?.name}' - CAUGHT A SHINY POKéMON~ -> '${message.author.username}'`,
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

        if (shiny) {
          const embed = new MessageEmbed()
            .setColor(COLOR_PURPLE)
            .setTitle('⭐ ' + currentSpawn.name.english + ' ⭐')
            .setDescription(response)
            .setImage(currentSpawn.images.shiny)
            .setTimestamp();

          const monsterChannel = message.guild?.channels.cache.find(
            (ch) => ch.name === cache.settings.specific_channel,
          );

          queueMsg(embed, message, false, 1, monsterChannel, true);
        } else {
          queueMsg(response, message, true, 1);
        }
      }
    } catch (error) {
      logger.error(error);
    }
  } else if (timestamp - (GCD || 0) > 5) {
    GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    queueMsg(`That is the wrong Pokémon!`, message, true, 1);
    logger.trace(`${message.author.username} is WRONG!`);
  }
}
