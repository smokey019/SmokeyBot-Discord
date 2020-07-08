import { Message, MessageEmbed } from 'discord.js';

import { theWord, chunk } from '../../utils';
import { getLogger } from '../../clients/logger';
import { findMonsterByID, IMonsterDex } from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { databaseClient } from '../../clients/database';
import { COLOR_GREEN, COLOR_WHITE } from '../../colors';

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
    let legendary = '';

    logger.debug(`Successfully fetched! Compiling..`);

    message_contents.push(`**Total ${theWord()}**: ${pokemon.length}\n`);

    const temp_monsters = [];

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByID(element.monster_id);
      if (!monster) return;

      if (
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--legendary' &&
          monster.special != 'Legendary') ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--mythical' &&
          monster.special != 'Mythical') ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--ultrabeast' &&
          monster.special != 'Ultrabeast') ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--shiny' &&
          !element.shiny) ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--mega' &&
          !monster.forme)
      ) {
        return;
      }

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

      const tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`;

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

    let all_monsters = [];

    if (message_contents.length > 20) {
      all_monsters = chunk(message_contents, 20);

      if (
        splitMsg.length >= 4 &&
        all_monsters.length > 1 &&
        !splitMsg[splitMsg.length - 1].match(
          /legendary|mythical|ultrabeast|shiny|mega/i,
        )
      ) {
        const page = parseInt(splitMsg[splitMsg.length - 1]) - 1;

        if (all_monsters[page]) {
          message_contents = all_monsters[page];
        }
      } else {
        message_contents = all_monsters[0];
      }
    }

    const new_msg = message_contents.join('\n');

    const embed = new MessageEmbed()
      .setAuthor(
        `${message.author.username}'s Pokémon`,
        message.author.avatarURL()?.toString(),
      )
      .setColor(COLOR_GREEN)
      .setDescription(new_msg);
    await message.channel
      .send(embed)
      .then((message) => {
        logger.debug(
          `Sent ${theWord()} for ${message.author.tag} in ${
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
    `Fetching Favorite ${theWord()} for ${message.author.tag} in ${
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
    let legendary = '';

    logger.trace(`Successfully fetched! Compiling..`);

    message_contents.push(
      `**Total Favorite ${theWord()}**: ${pokemon.length}\n`,
    );

    const temp_monsters = [];

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByID(element.monster_id);

      if (
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--legendary' &&
          monster.special != 'Legendary') ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--mythical' &&
          monster.special != 'Mythical') ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--ultrabeast' &&
          monster.special != 'Ultrabeast') ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--shiny' &&
          !element.shiny) ||
        (splitMsg[splitMsg.length - 1].toLowerCase() == '--mega' &&
          !monster.forme)
      ) {
        return;
      }

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

      const tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`;

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

    let all_monsters = [];

    if (message_contents.length > 20) {
      all_monsters = chunk(message_contents, 20);

      if (
        splitMsg.length >= 4 &&
        all_monsters.length > 1 &&
        !splitMsg[splitMsg.length - 1].match(
          /legendary|mythical|ultrabeast|shiny|mega/i,
        )
      ) {
        const page = parseInt(splitMsg[splitMsg.length - 1]) - 1;

        if (all_monsters[page]) {
          message_contents = all_monsters[page];
        }
      } else {
        message_contents = all_monsters[0];
      }
    }

    const new_msg = message_contents.join('\n');

    const embed = new MessageEmbed()
      .setAuthor(
        `${message.author.username}'s Pokémon`,
        message.author.avatarURL()?.toString(),
      )
      .setColor(COLOR_WHITE)
      .setDescription(new_msg);
    await message.channel
      .send(embed)
      .then((message) => {
        logger.debug(`Sent favorites in ${message.guild?.name}!`);
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
/**
 *
 * @param message
 */
export async function searchMonsters(message: Message): Promise<void> {
  const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');

  const sort = [splitMsg[2], splitMsg[3]];

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
    let legendary = '';

    const temp_monsters = [];

    pokemon.forEach((element: IMonsterModel) => {
      const monster: IMonsterDex = findMonsterByID(element.monster_id);
      if (
        !monster ||
        monster.name.english.toLowerCase().replace(/♂|♀/g, '') !=
          splitMsg[1].toLowerCase()
      )
        return;

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

      const tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **LVL ${element.level}** - **IV ${averageIV}%**`;

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

    if (message_contents.length > 10) {
      let all_monsters = [];

      all_monsters = chunk(message_contents, 10);

      if (splitMsg.length > 4 && all_monsters.length > 1) {
        const page = parseInt(splitMsg[splitMsg.length - 1]) - 1;

        if (all_monsters[page]) {
          message_contents = all_monsters[page];
        }
      } else {
        message_contents = all_monsters[0];
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
        .then(() => {
          logger.debug(
            `Sent ${theWord()} for ${message.author.username} in ${
              message.guild?.name
            }!`,
          );
        })
        .catch(console.error);
    } else {
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
        .then(() => {
          logger.debug(
            `Sent ${theWord()} for ${message.author.username} in ${
              message.guild?.name
            }!`,
          );
        })
        .catch(console.error);
    }
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
