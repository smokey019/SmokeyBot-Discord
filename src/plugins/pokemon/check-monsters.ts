import { Message, MessageEmbed } from 'discord.js';

import { theWord } from '../../utils';
import { getLogger } from '../../clients/logger';
import { findMonsterByID } from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { databaseClient } from '../../clients/database';

const logger = getLogger('Pokemon');

/**
 *
 * @param message
 */
export async function checkMonsters(message: Message): Promise<void> {
  logger.debug(
    `Fetching ${theWord()} for ${message.author.username} in ${
      message.guild?.name
    }..`,
  );

  const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');

  const sort = [splitMsg[1], splitMsg[2]];

  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      uid: message.author.id,
      released: 0,
    });

  if (pokemon.length > 0) {
    let message_contents = [];
    let shiny = '';
    let favorite = '';

    logger.debug(`Successfully fetched! Compiling..`);

    message_contents.push(`**Total ${theWord()}**: ${pokemon.length}\n`);

    const temp_monsters = [];

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByID(element.monster_id);

      if (element.shiny) {
        shiny = ' ⭐';
      } else {
        shiny = '';
      }

      if (element.favorite) {
        favorite = ' 💟';
      } else {
        favorite = '';
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

      const tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}**${favorite} - **Level ${element.level}** - **Avg IV ${averageIV}%**`;

      temp_monsters.push({
        id: element.id,
        name: monster.name.english,
        shiny: shiny,
        level: element.level,
        iv: averageIV,
        msg: tmpMsg,
      });
    });

    if (sort[0] == 'iv' && sort[1] == 'high') {
      temp_monsters.sort(function(a, b) {
        return b.iv - a.iv;
      });
    } else if (sort[0] == 'iv' && sort[1] == 'low') {
      temp_monsters.sort(function(a, b) {
        return a.iv - b.iv;
      });
    } else if (sort[0] == 'level' && sort[1] == 'low') {
      temp_monsters.sort(function(a, b) {
        return a.level - b.level;
      });
    } else if (sort[0] == 'level' && sort[1] == 'high') {
      temp_monsters.sort(function(a, b) {
        return b.level - a.level;
      });
    } else if (sort[0] == 'id' && sort[1] == 'high') {
      temp_monsters.sort(function(a, b) {
        return b.id - a.id;
      });
    } else if (sort[0] == 'id' && sort[1] == 'low') {
      temp_monsters.sort(function(a, b) {
        return a.id - b.id;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '+') {
      temp_monsters.sort(function(a, b) {
        return b.shiny - a.shiny;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '-') {
      temp_monsters.sort(function(a, b) {
        return a.shiny - b.shiny;
      });
    } else if (sort[0] == 'name' && sort[1] == 'desc') {
      temp_monsters.sort(function(a, b) {
        return b.name - a.name;
      });
    } else if (sort[0] == 'name' && sort[1] == 'asc') {
      temp_monsters.sort(function(a, b) {
        return a.name - b.name;
      });
    } else {
      temp_monsters.sort(function(a, b) {
        return b.id - a.id;
      });
    }

    temp_monsters.forEach((element) => {
      message_contents.push(element.msg);
    });

    if (message_contents.length > 30) {
      message_contents = message_contents.slice(0, 31);
    }

    const new_msg = message_contents.join('\n');

    const embed = new MessageEmbed()
      .setAuthor(
        `${message.author.username}'s Pokémon`,
        message.author.avatarURL()?.toString(),
      )
      .setColor(0xff0000)
      .setDescription(new_msg);
    await message.channel
      .send(embed)
      .then((message) => {
        logger.debug(
          `Sent ${theWord()} for ${message.author.username} in ${
            message.guild?.name
          }!`,
        );
      })
      .catch(console.error);
  } else {
    message
      .reply(`You don't have any monsters in your Pokédex. :(`)
      .then(() => {
        logger.debug(`${message.author.username} doesn't have any Pokémon!`);
        return;
      })
      .catch(console.error);
  }
}

/**
 *
 * @param message
 */
export async function checkFavorites(message: Message): Promise<void> {
  logger.debug(
    `Fetching Favorite ${theWord()} for ${message.author.username} in ${
      message.guild?.name
    }..`,
  );

  const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');

  const sort = [splitMsg[1], splitMsg[2]];

  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      uid: message.author.id,
      released: 0,
      favorite: 1,
    });

  if (pokemon.length > 0) {
    let message_contents = [];
    let shiny = '';
    let favorite = '';

    logger.trace(`Successfully fetched! Compiling..`);

    message_contents.push(
      `**Total Favorite ${theWord()}**: ${pokemon.length}\n`,
    );

    const temp_monsters = [];

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByID(element.monster_id);

      if (element.shiny) {
        shiny = ' ⭐';
      } else {
        shiny = '';
      }

      if (element.favorite) {
        favorite = ' 💟';
      } else {
        favorite = '';
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

      const tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}**${favorite} - **Level ${element.level}** - **Avg IV ${averageIV}%**`;

      temp_monsters.push({
        id: element.id,
        name: monster.name.english,
        shiny: shiny,
        level: element.level,
        iv: averageIV,
        msg: tmpMsg,
      });
    });

    if (sort[0] == 'iv' && sort[1] == 'high') {
      temp_monsters.sort(function(a, b) {
        return b.iv - a.iv;
      });
    } else if (sort[0] == 'iv' && sort[1] == 'low') {
      temp_monsters.sort(function(a, b) {
        return a.iv - b.iv;
      });
    } else if (sort[0] == 'level' && sort[1] == 'low') {
      temp_monsters.sort(function(a, b) {
        return a.level - b.level;
      });
    } else if (sort[0] == 'level' && sort[1] == 'high') {
      temp_monsters.sort(function(a, b) {
        return b.level - a.level;
      });
    } else if (sort[0] == 'id' && sort[1] == 'high') {
      temp_monsters.sort(function(a, b) {
        return b.id - a.id;
      });
    } else if (sort[0] == 'id' && sort[1] == 'low') {
      temp_monsters.sort(function(a, b) {
        return a.id - b.id;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '+') {
      temp_monsters.sort(function(a, b) {
        return b.shiny - a.shiny;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '-') {
      temp_monsters.sort(function(a, b) {
        return a.shiny - b.shiny;
      });
    } else if (sort[0] == 'name' && sort[1] == 'desc') {
      temp_monsters.sort(function(a, b) {
        return b.name - a.name;
      });
    } else if (sort[0] == 'name' && sort[1] == 'asc') {
      temp_monsters.sort(function(a, b) {
        return a.name - b.name;
      });
    } else {
      temp_monsters.sort(function(a, b) {
        return b.id - a.id;
      });
    }

    temp_monsters.forEach((element) => {
      message_contents.push(element.msg);
    });

    if (message_contents.length > 30) {
      message_contents = message_contents.slice(0, 31);
    }

    const new_msg = message_contents.join('\n');

    const embed = new MessageEmbed()
      .setAuthor(
        `${message.author.username}'s Pokémon`,
        message.author.avatarURL()?.toString(),
      )
      .setColor(0xff0000)
      .setDescription(new_msg);
    await message.channel
      .send(embed)
      .then((message) => {
        logger.debug(
          `Sent ${theWord()} for ${message.author.username} in ${
            message.guild?.name
          }!`,
        );
      })
      .catch(console.error);
  } else {
    message
      .reply(`You don't have any favorite monsters in your Pokédex. :(`)
      .then(() => {
        logger.debug(
          `${message.author.username} doesn't have any favorite Pokémon!`,
        );
        return;
      })
      .catch(console.error);
  }
}
