import { CommandInteraction, MessageEmbed } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { COLOR_GREEN, COLOR_WHITE } from '../../colors';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel } from '../../models/MonsterUser';
import { chunk, format_number } from '../../utils';
import { userDex } from './info';
import {
  findMonsterByIDLocal,
  getPokedex,
  getUsersFavoriteMonsters,
  getUsersMonsters
} from './monsters';

const logger = getLogger('Pokémon');

export async function checkMonstersNew(
  interaction: CommandInteraction,
  favorites?: 0 | 1,
): Promise<void> {
  logger.debug(
    `Fetching Pokémon for ${interaction.user.username} in ${interaction.guild?.name}..`,
  );
  let pokemon: IMonsterModel[];

  if (favorites) {
    pokemon = await getUsersFavoriteMonsters(interaction.user.id);
  } else {
    pokemon = await getUsersMonsters(interaction.user.id);
  }

  const sort = interaction.options.getString('options');

  if (pokemon) {
    let message_contents = [];
    let shiny = '';
    let favorite = '';
    let legendary = '';

    logger.debug(`Successfully fetched! Compiling..`);

    const temp_monsters = [];

    const user: IMonsterUserModel = await getUser(interaction.user.id);

    const current_monster = await databaseClient<IMonsterModel>(MonsterTable)
      .first()
      .where('id', user.current_monster);

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByIDLocal(element.monster_id);

      if (!monster) return;

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

      let tmpMsg = '';

      if (element.id == current_monster.id) {
        tmpMsg = `__**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**__`;
      } else {
        tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`;
      }

      temp_monsters.push({
        id: element.id,
        name: monster.name.english,
        shiny: shiny,
        level: element.level,
        iv: averageIV,
        msg: tmpMsg,
      });
    });

    if (sort == 'iv_high') {
      temp_monsters.sort(function (a, b) {
        return b.iv - a.iv;
      });
    } else if (sort == 'iv_low') {
      temp_monsters.sort(function (a, b) {
        return a.iv - b.iv;
      });
    } else if (sort == 'level_low') {
      temp_monsters.sort(function (a, b) {
        return a.level - b.level;
      });
    } else if (sort == 'level_high') {
      temp_monsters.sort(function (a, b) {
        return b.level - a.level;
      });
    } else if (sort == 'id_high') {
      temp_monsters.sort(function (a, b) {
        return b.id - a.id;
      });
    } else if (sort == 'id_low') {
      temp_monsters.sort(function (a, b) {
        return a.id - b.id;
      });
    } else if (sort == 'shiny_high') {
      temp_monsters.sort(function (a, b) {
        return b.shiny - a.shiny;
      });
    } else if (sort == 'shiny_low') {
      temp_monsters.sort(function (a, b) {
        return a.shiny - b.shiny;
      });
    } else if (sort == 'name_low') {
      temp_monsters.sort(function (a, b) {
        return b.name - a.name;
      });
    } else if (sort == 'name_high') {
      temp_monsters.sort(function (a, b) {
        return a.name - b.name;
      });
    } else {
      temp_monsters.sort(function (a, b) {
        return b.id - a.id;
      });
    }

    temp_monsters.forEach((element) => {
      message_contents.push(element.msg);
    });

    let all_monsters = [];

    if (message_contents.length > 20) {
      all_monsters = chunk(message_contents, 20);

      message_contents = all_monsters[0];

      message_contents.push(`\nTotal Monsters: **${pokemon.length}**`);
    }

    let new_msg = message_contents.join('\n');

    if (new_msg.length > 2000) {
      new_msg = new_msg.slice(0, 1997) + '...';
    }

    const embed = new MessageEmbed()
      .setAuthor(
        'User Profile',
        interaction.user.avatarURL()?.toString(),
        `https://bot.smokey.gg/user/${interaction.user.id}/pokemon`,
      )
      .setTitle(
        `${interaction.user.username}'s Pokémon\n\nShowing: ${
          format_number(message_contents.length) +
          '/' +
          format_number(pokemon.length)
        }`,
      )
      .setColor(COLOR_GREEN)
      .setDescription(new_msg);

    queueMsg(embed, interaction, true, 1, undefined, true);
    logger.debug(
      `Sent Pokémon for ${interaction.user.tag} in ${interaction.guild?.name}!`,
    );
  } else {
    queueMsg("You don't have any Pokémon.", interaction, true);
  }
}

/**
 *
 * @param message
 */
export async function checkMonsters(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  logger.debug(
    `Fetching Pokémon for ${interaction.user.username} in ${interaction.guild?.name}..`,
  );

  const splitMsg = args;

  const sort = [splitMsg[1], splitMsg[2]];

  const pokemon = await getUsersMonsters(interaction.user.id);

  if (pokemon.length > 0) {
    let message_contents = [];
    let shiny = '';
    let favorite = '';
    let legendary = '';

    logger.debug(`Successfully fetched! Compiling..`);

    const temp_monsters = [];

    const user: IMonsterUserModel = await getUser(interaction.user.id);

    const current_monster = await databaseClient<IMonsterModel>(MonsterTable)
      .first()
      .where('id', user.current_monster);

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByIDLocal(element.monster_id);

      if (!monster) return;

      if (
        (splitMsg[splitMsg.length - 1].match(/legendary/i) &&
          monster.special != 'Legendary') ||
        (splitMsg[splitMsg.length - 1].match(/mythical/i) &&
          monster.special != 'Mythical') ||
        (splitMsg[splitMsg.length - 1].match(/ultrabeast/i) &&
          monster.special != 'Ultrabeast') ||
        (splitMsg[splitMsg.length - 1].match(/shiny/i) && !element.shiny) ||
        (splitMsg[splitMsg.length - 1].match(/mega/i) && !monster.forme)
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

      let tmpMsg = '';

      if (element.id == current_monster.id) {
        tmpMsg = `__**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**__`;
      } else {
        tmpMsg = `**${element.id}** - **${monster.name.english}${shiny}${favorite}${legendary}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`;
      }

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
      temp_monsters.sort(function (a, b) {
        return b.iv - a.iv;
      });
    } else if (sort[0] == 'iv' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.iv - b.iv;
      });
    } else if (sort[0] == 'level' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.level - b.level;
      });
    } else if (sort[0] == 'level' && sort[1] == 'high') {
      temp_monsters.sort(function (a, b) {
        return b.level - a.level;
      });
    } else if (sort[0] == 'id' && sort[1] == 'high') {
      temp_monsters.sort(function (a, b) {
        return b.id - a.id;
      });
    } else if (sort[0] == 'id' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.id - b.id;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '+') {
      temp_monsters.sort(function (a, b) {
        return b.shiny - a.shiny;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '-') {
      temp_monsters.sort(function (a, b) {
        return a.shiny - b.shiny;
      });
    } else if (sort[0] == 'name' && sort[1] == 'desc') {
      temp_monsters.sort(function (a, b) {
        return b.name - a.name;
      });
    } else if (sort[0] == 'name' && sort[1] == 'asc') {
      temp_monsters.sort(function (a, b) {
        return a.name - b.name;
      });
    } else {
      temp_monsters.sort(function (a, b) {
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

          message_contents.push(
            `Page: **${page + 1}/${format_number(all_monsters.length)}**`,
          );
        }
      } else {
        message_contents = all_monsters[0];

        message_contents.push(
          `Page: **1/${format_number(all_monsters.length)}**`,
        );
      }
    }

    const new_msg = message_contents.join('\n');

    const embed = new MessageEmbed()
      .setAuthor(
        `${interaction.user.username}'s Pokémon\nShowing: ${
          format_number(message_contents.length) +
          '/' +
          format_number(pokemon.length)
        }`,
        interaction.user.avatarURL()?.toString(),
      )
      .setColor(COLOR_GREEN)
      .setDescription(new_msg);
    await interaction.channel
      .send({ embeds: [embed] })
      .then(() => {
        logger.debug(
          `Sent Pokémon for ${interaction.user.tag} in ${interaction.guild?.name}!`,
        );
      })
      .catch(async (err) => {
        logger.error(err);
      });
  } else {
    (interaction as CommandInteraction)
      .reply(`You don't have any monsters in your Pokédex. :(`)
      .then(() => {
        logger.debug(`${interaction.user.username} doesn't have any Pokémon!`);
        return;
      })
      .catch(async (err) => {
        logger.error(err);
      });
  }
}

export async function checkPokedex(
  interaction: CommandInteraction,
): Promise<void> {
  const pokemon = await userDex(interaction.user.id);

  const pokedex = getPokedex();

  const msg_array = [];
  let pokemon_count = 0;

  const missing = interaction.options.getBoolean('missing');

  pokedex.forEach((dex) => {
    if (!dex.images || !dex.images.normal) return;
    let count = 0;
    if (pokemon.includes(dex.id)) {
      pokemon.forEach((monster) => {
        if (monster == dex.id) {
          count++;
        }
      });
      if (!missing) {
        msg_array.push(
          `**${dex.id}** - **${dex.name.english}** - **${count}**`,
        );
        pokemon_count++;
      }
    } else {
      msg_array.push(`**${dex.id}** - **${dex.name.english}** - **0**`);
      pokemon_count++;
    }
  });

  const all_monsters = chunk(msg_array, 20);

  const new_msg = all_monsters.join('\n');

  const embed = new MessageEmbed()
    .setAuthor(
      `Pokédex - Total Pokémon: ${pokemon_count}`,
      interaction.user.avatarURL(),
    )
    .setColor(COLOR_WHITE)
    .setDescription(new_msg);
  await interaction.channel
    .send({ embeds: [embed] })
    .then((interaction) => {
      logger.debug(`Sent PokeDex in ${interaction.guild?.name}!`);
    })
    .catch(async (err) => {
      logger.error(err);
    });
}

/**
 *
 * @param message
 */
export async function checkFavorites(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  logger.debug(
    `Fetching Favorite Pokémon for ${interaction.user.tag} in ${interaction.guild?.name}..`,
  );

  const splitMsg = args;

  const sort = [splitMsg[1], splitMsg[2]];

  const pokemon = await getUsersFavoriteMonsters(interaction.user.id);

  if (pokemon.length > 0) {
    let message_contents = [];
    let shiny = '';
    let favorite = '';
    let legendary = '';

    logger.trace(`Successfully fetched! Compiling..`);

    const temp_monsters = [];

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByIDLocal(element.monster_id);

      if (!monster) return;

      if (
        (splitMsg[splitMsg.length - 1].match(/legendary/i) &&
          monster.special != 'Legendary') ||
        (splitMsg[splitMsg.length - 1].match(/mythical/i) &&
          monster.special != 'Mythical') ||
        (splitMsg[splitMsg.length - 1].match(/ultrabeast/i) &&
          monster.special != 'Ultrabeast') ||
        (splitMsg[splitMsg.length - 1].match(/shiny/i) && !element.shiny) ||
        (splitMsg[splitMsg.length - 1].match(/mega/i) && !monster.forme)
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
      temp_monsters.sort(function (a, b) {
        return b.iv - a.iv;
      });
    } else if (sort[0] == 'iv' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.iv - b.iv;
      });
    } else if (sort[0] == 'level' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.level - b.level;
      });
    } else if (sort[0] == 'level' && sort[1] == 'high') {
      temp_monsters.sort(function (a, b) {
        return b.level - a.level;
      });
    } else if (sort[0] == 'id' && sort[1] == 'high') {
      temp_monsters.sort(function (a, b) {
        return b.id - a.id;
      });
    } else if (sort[0] == 'id' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.id - b.id;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '+') {
      temp_monsters.sort(function (a, b) {
        return b.shiny - a.shiny;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '-') {
      temp_monsters.sort(function (a, b) {
        return a.shiny - b.shiny;
      });
    } else if (sort[0] == 'name' && sort[1] == 'desc') {
      temp_monsters.sort(function (a, b) {
        return b.name - a.name;
      });
    } else if (sort[0] == 'name' && sort[1] == 'asc') {
      temp_monsters.sort(function (a, b) {
        return a.name - b.name;
      });
    } else {
      temp_monsters.sort(function (a, b) {
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

          message_contents.push(
            `Page: **${page + 1}/${format_number(all_monsters.length)}**`,
          );
        }
      } else {
        message_contents = all_monsters[0];

        message_contents.push(
          `Page: **1/${format_number(all_monsters.length)}**`,
        );
      }
    }

    const new_msg = message_contents.join('\n');

    const embed = new MessageEmbed()
      .setAuthor(
        `${interaction.user.username}'s Favorites\nShowing: ${
          format_number(message_contents.length) +
          '/' +
          format_number(pokemon.length)
        }\nTotal: ${format_number(pokemon.length)}`,
        interaction.user.avatarURL()?.toString(),
      )
      .setColor(COLOR_WHITE)
      .setDescription(new_msg);
    await interaction.channel
      .send({ embeds: [embed] })
      .then((interaction) => {
        logger.debug(`Sent favorites in ${interaction.guild?.name}!`);
      })
      .catch(async (err) => {
        logger.error(err);
      });
  } else {
    (interaction as CommandInteraction)
      .reply(
        `You don't have any favorite monsters in your Pokédex. :( Use \`!favorite ID\` to add one.`,
      )
      .then(() => {
        logger.debug(
          `${interaction.user.username} doesn't have any favorite Pokémon!`,
        );
        return;
      })
      .catch(async (err) => {
        logger.error(err);
      });
  }
}

/**
 *
 * @param message
 */
export async function searchMonsters(
  interaction: CommandInteraction,
): Promise<void> {
  const sort = ['iv', 'high'];
  const search = interaction.options.getString('pokemon').toLowerCase().replace(/ {2,}/g, ' ');
  const page = 0;

  const pokemon = await getUsersMonsters(interaction.user.id);

  if (pokemon.length > 0) {
    let message_contents = [];
    let shiny = '';
    let favorite = '';
    let legendary = '';

    const temp_monsters = [];

    pokemon.forEach((element: IMonsterModel) => {
      const monster = findMonsterByIDLocal(element.monster_id);
      if (!monster) return;

      if (monster.name.english.toLowerCase().replace(/♂|♀/g, '') != search
      )
        return;

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
      temp_monsters.sort(function (a, b) {
        return b.iv - a.iv;
      });
    } else if (sort[0] == 'iv' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.iv - b.iv;
      });
    } else if (sort[0] == 'level' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.level - b.level;
      });
    } else if (sort[0] == 'level' && sort[1] == 'high') {
      temp_monsters.sort(function (a, b) {
        return b.level - a.level;
      });
    } else if (sort[0] == 'id' && sort[1] == 'high') {
      temp_monsters.sort(function (a, b) {
        return b.id - a.id;
      });
    } else if (sort[0] == 'id' && sort[1] == 'low') {
      temp_monsters.sort(function (a, b) {
        return a.id - b.id;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '+') {
      temp_monsters.sort(function (a, b) {
        return b.shiny - a.shiny;
      });
    } else if (sort[0] == 'shiny' && sort[1] == '-') {
      temp_monsters.sort(function (a, b) {
        return a.shiny - b.shiny;
      });
    } else if (sort[0] == 'name' && sort[1] == 'desc') {
      temp_monsters.sort(function (a, b) {
        return b.name - a.name;
      });
    } else if (sort[0] == 'name' && sort[1] == 'asc') {
      temp_monsters.sort(function (a, b) {
        return a.name - b.name;
      });
    } else {
      temp_monsters.sort(function (a, b) {
        return b.id - a.id;
      });
    }

    temp_monsters.forEach((element) => {
      message_contents.push(element.msg);
    });

    if (message_contents.length > 10) {
      let all_monsters = [];

      all_monsters = chunk(message_contents, 10);

      if (page && all_monsters.length > 1) {
        if (all_monsters[page]) {
          message_contents = all_monsters[page];
        }
      } else {
        message_contents = all_monsters[0];
      }

      const new_msg = message_contents.join('\n');

      const embed = new MessageEmbed()
        .setAuthor(
          `${interaction.user.username}'s search for '${search}' - Total: ${
            format_number(message_contents.length) +
            '/' +
            format_number(pokemon.length)
          } - Pages: ${format_number(all_monsters.length)}`,
          interaction.user.avatarURL()?.toString(),
        )
        .setColor(0xff0000)
        .setDescription(new_msg);
      await interaction.reply({ embeds: [embed] })
        .then(() => {
          logger.debug(
            `Sent Pokémon for ${interaction.user.username} in ${interaction.guild?.name}!`,
          );
        })
        .catch(async (err) => {
          logger.error(err);
        });
    } else if (message_contents.length == 0) {
      (interaction as CommandInteraction).reply(`Cannot find '${search}'.`);
    } else {
      const new_msg = message_contents.join('\n');

      const embed = new MessageEmbed()
        .setAuthor(
          `${interaction.user.username}'s search for '${search}' - Total: ${
            format_number(message_contents.length) +
            '/' +
            format_number(pokemon.length)
          }`,
          interaction.user.avatarURL()?.toString(),
        )
        .setColor(0xff0000)
        .setDescription(new_msg);
      await interaction.reply({ embeds: [embed] })
        .then(() => {
          logger.debug(
            `Sent Pokémon for ${interaction.user.username} in ${interaction.guild?.name}!`,
          );
        })
        .catch(async (err) => {
          logger.error(err);
        });
    }
  } else {
    (interaction as CommandInteraction)
      .reply(`You don't have any monsters in your Pokédex. :(`)
      .then(() => {
        logger.debug(`${interaction.user.username} doesn't have any Pokémon!`);
        return;
      })
      .catch(async (err) => {
        logger.error(err);
      });
  }
}
