import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { GLOBAL_COOLDOWN, getGCD } from '../../clients/cache';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { MonsterTable, type IMonsterModel } from '../../models/Monster';
import { MonsterUserTable, type IMonsterUserModel } from '../../models/MonsterUser';
import { getCurrentTime, getRndInteger } from '../../utils';
import { queueMsg } from '../emote_queue';
import { userDex } from './info';
import type { IMonsterDex } from './monsters';
import { getRandomNature } from './natures';
import { getSpawn, updateSpawn } from './spawn-monster';
import { rollGender, rollLevel, rollPerfectIV, rollShiny } from './utils';

const logger = getLogger('Pokémon-Catch');

/**
 * Returns true if the first value matches any of the currently spawned
 * names. Case insensitive.
 *
 * @param interactionContent
 * @param currentSpawn
 */
function monsterMatchesPrevious(
  interactionContent: string,
  { name }: IMonsterDex,
) {
  const monster = interactionContent.toLowerCase();

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
 * @param interaction
 * @param cache
 */
export async function catchMonster(
  interaction: CommandInteraction,
): Promise<void> {
  const timestamp = getCurrentTime();
  const GCD = await getGCD(interaction.guild.id);
  //const spawn = await MONSTER_SPAWNS.get(interaction.guild.id);
  const data = await getSpawn(interaction.guild.id);
  const attempt = interaction.options.get('pokemon').value?.toString().toLowerCase();
  const spawn = data.spawn_data;

  if (spawn.monster && monsterMatchesPrevious(attempt, spawn.monster)) {
    logger.trace(
      `${interaction.guild?.name} - ${interaction.user.username} | Starting catch~`,
    );

    let level = 0;

    const shiny = rollShiny();
    let gender = rollGender();
    let isEgg = 0;
    const currentSpawn: IMonsterDex = spawn.monster;

    if (currentSpawn.name.english == 'Egg') {
      isEgg = 1;
    }

    if (currentSpawn.evoLevel) {
      level = rollLevel(currentSpawn.evoLevel, 60);
    } else {
      level = rollLevel(1, 49);
    }

    if (currentSpawn.gender == 'N') {
      gender = 'N';
    }

    spawn.monster = null;

    await updateSpawn(interaction.guild.id, spawn);
    //MONSTER_SPAWNS.set(interaction.guild.id, spawn);

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
      uid: interaction.user.id,
      original_uid: interaction.user.id,
      shiny: shiny,
      captured_at: Date.now(),
      gender: gender,
      egg: isEgg,
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
      const dex = await userDex(interaction.user.id);

      const insertMonster = await databaseClient<IMonsterModel>(
        MonsterTable,
      ).insert(monster);

      const updateUser = await databaseClient<IMonsterUserModel>(
        MonsterUserTable,
      )
        .where({ uid: interaction.user.id })
        .update({ latest_monster: insertMonster[0] })
        .increment('currency', 10)
        .increment('streak', 1);

      if (!updateUser) {
        logger.debug(
          `${interaction.guild?.name} - ${interaction.user.username} | Couldn't update user, insert to user DB~`,
        );

        await databaseClient<IMonsterUserModel>(MonsterUserTable).insert({
          current_monster: insertMonster[0],
          latest_monster: insertMonster[0],
          uid: interaction.user.id,
          dex: '[]',
        });

        logger.debug(`Successfully inserted user ${interaction.user.username}`);
      }

      if (insertMonster) {
        const random_grats = ['YOINK', 'YOINKERS', 'NICE', 'NOICE', 'Congrats'];
        let response = ``;
        let shiny_msg = '';
        let legendary = '';
        let egg_info = ``;

        if (shiny) {
          shiny_msg = ' ⭐';
        }

        if (currentSpawn.name.english == 'Egg') {
          egg_info =
            '\n\nEggs have a random chance of hatching into anything, with an increased chance at being shiny by selecting and leveling it to 50!';
        }

        if (currentSpawn.special) {
          legendary = ` 💠`;
        }

        currentSpawn.id = parseFloat(currentSpawn.id.toString());

        if (shiny == 1 && !dex.includes(currentSpawn.id)) {
          response = `_**POGGERS**_! You caught a __***SHINY***__ level **${level} ${
            currentSpawn.name.english
          }**${shiny_msg + legendary}! \n\n Avg IV: **${averageIV}**% \nID: **${
            insertMonster[0]
          }** \n\nAdded to Pokédex.$`;
          logger.error(
            `'${interaction.guild?.name}' - '${interaction.user.username}' CAUGHT A SHINY POKéMON~'`,
          );
          await databaseClient<IMonsterUserModel>(MonsterUserTable)
            .where({ uid: interaction.user.id })
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
            `'${interaction.guild?.name}' - '${interaction.user.username}' CAUGHT A POKéMON~`,
          );
          await databaseClient<IMonsterUserModel>(MonsterUserTable)
            .where({ uid: interaction.user.id })
            .increment('currency', 100);
        } else if (shiny == 0 && dex.includes(currentSpawn.id)) {
          response = `**${
            random_grats[getRndInteger(0, random_grats.length - 1)]
          }**! You caught a level **${level} ${currentSpawn.name.english}**${
            shiny_msg + legendary
          }! Avg IV: **${averageIV}**% - ID: **${insertMonster[0]}**.`;
          logger.info(
            `'${interaction.guild?.name}' - '${interaction.user.username}' CAUGHT A POKéMON~`,
          );
        } else if (shiny == 1 && dex.includes(currentSpawn.id)) {
          response = `_**POGGERS**_! You caught a __***SHINY***__ level **${level} ${
            currentSpawn.name.english
          }${shiny_msg + legendary}**! \n\n Avg IV: **${averageIV}**% \nID: **${
            insertMonster[0]
          }**.`;
          logger.error(
            `'${interaction.guild?.name}' - '${interaction.user.username}' CAUGHT A SHINY POKéMON~`,
          );
        }

        response = response + egg_info;

        const user = await getUser(interaction.user.id);

        if (user) {
          if (user.streak == 10) {
            await databaseClient<IMonsterUserModel>(MonsterUserTable)
              .where({ uid: interaction.user.id })
              .update({ streak: 0 })
              .increment('currency', 250);
          }
        }

        if (shiny) {
          const embed = new EmbedBuilder()
            .setTitle('⭐ ' + currentSpawn.name.english + ' ⭐')
            .setDescription(response)
            .setImage(currentSpawn.images.shiny)
            .setTimestamp();

          //queueMsg(embed, interaction, true, 1, undefined, true);
          interaction.reply({ embeds: [embed] });
        } else {
          //queueMsg(response, interaction, true, 1);
          interaction.reply(response);
        }
      }
    } catch (error) {
      logger.error(error);
    }
  } else if (timestamp - (GCD || 0) > 5) {
    GLOBAL_COOLDOWN.set(interaction.guild.id, getCurrentTime());

    queueMsg(`That is the wrong Pokémon!`, interaction, true, 1);
    logger.trace(`${interaction.user.username} is WRONG!`);
  }
}
