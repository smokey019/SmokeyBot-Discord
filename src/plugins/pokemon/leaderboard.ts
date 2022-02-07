import { CommandInteraction, MessageEmbed } from 'discord.js';
import { getLogger } from 'log4js';
import { databaseClient } from '../../clients/database';
import { COLOR_GREEN } from '../../colors';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { findMonsterByIDLocal, findMonsterByName } from './monsters';

const logger = getLogger('Pokémon-Leaderboard');

export async function checkLeaderboard(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  let search = undefined;

  if (args.includes('iv') && args.includes('high')) {
    args.splice(args.length - 2, 2);

    search = args.join(' ');
  }

  const type = args[0]?.toLowerCase() || 'iv';
  const sort = args[1]?.toLowerCase() || 'high';

  const monsters = await getTopPokemon(25, type, sort, search);

  if (monsters) {
    const message_contents = [];
    let shiny = '';
    let legendary = '';

    logger.debug(`Successfully fetched leaderboard! Compiling..`);

    const temp_monsters = [];

    monsters.forEach((element: IMonsterModel) => {
      const monster = findMonsterByIDLocal(element.monster_id);

      if (!monster) return;

      if (element.shiny) {
        shiny = ' ⭐';
      } else {
        shiny = '';
      }

      if (monster.special) {
        legendary = ` 💠`;
      } else {
        legendary = '';
      }

      const averageIV = (
        ((element.hp +
          element.attack +
          element.defense +
          element.sp_attack +
          element.sp_defense +
          element.speed) /
          186) *
        100
      ).toFixed(2);

      const tmpMsg = `**${element.id} - ${monster.name.english}${shiny}${legendary} - Level ${element.level} - Avg IV ${averageIV}% - Owner: <@${element.uid}>**`;

      temp_monsters.push({
        id: element.id,
        name: monster.name.english,
        shiny: shiny,
        level: element.level,
        iv: averageIV,
        msg: tmpMsg,
      });
    });

    temp_monsters.forEach((element) => {
      message_contents.push(element.msg);
    });

    const new_msg = message_contents.join('\n');

    const embed = new MessageEmbed()
      .setAuthor(`Top 25 Pokémon`)
      .setColor(COLOR_GREEN)
      .setDescription(new_msg);
    await interaction.channel
      .send({ embeds: [embed] })
      .then((interaction) => {
        logger.debug(`Sent leaderboard in ${interaction.guild?.name}!`);
      })
      .catch((error) => {
        logger.error(error);
      });
  } else {
    (interaction as CommandInteraction)
      .reply(`There was an error.`)
      .then(() => {
        logger.debug(`There was an error getting the leaderboard.`);
        return;
      })
      .catch((err) => {
        logger.error(err);
      });
  }
}

async function getTopPokemon(
  limit = 25,
  type = 'iv',
  sort = 'high',
  search: string,
): Promise<IMonsterModel[]> {
  if (search) {
    if (type.match(/iv|stats|average/i)) {
      type = 'avg_iv';
    } else {
      type = 'avg_iv';
    }
    if (sort == 'low') {
      sort = 'asc';
    } else {
      sort = 'desc';
    }
    const monster = findMonsterByName(search);

    if (monster) {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .where({
          monster_id: monster.id,
        })
        .orderBy(type, sort)
        .limit(limit);

      return monsters;
    } else {
      return null;
    }
  } else {
    if (type == 'iv' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('avg_iv', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'iv' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('avg_iv', 'asc')
        .limit(limit);

      return monsters;
    } else if (type == 'hp' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('hp', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'hp' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('hp', 'asc')
        .limit(limit);

      return monsters;
    } else if (type == 'attack' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('attack', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'attack' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('attack', 'asc')
        .limit(limit);

      return monsters;
    } else if (type == 'defense' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('defense', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'defense' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('defense', 'asc')
        .limit(limit);

      return monsters;
    } else if (type == 'sp_attack' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('sp_attack', 'asc')
        .limit(limit);

      return monsters;
    } else if (type == 'sp_attack' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('sp_attack', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'sp_defense' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('sp_defense', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'sp_defense' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('sp_defense', 'asc')
        .limit(limit);

      return monsters;
    } else if (type == 'speed' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('speed', 'asc')
        .limit(limit);

      return monsters;
    } else if (type == 'speed' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('speed', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'id' && sort == 'high') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('id', 'desc')
        .limit(limit);

      return monsters;
    } else if (type == 'id' && sort == 'low') {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('id', 'asc')
        .limit(limit);

      return monsters;
    } else {
      const monsters = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .orderBy('avg_iv', 'desc')
        .limit(limit);

      return monsters;
    }
  }
}
