import { BaseCommandInteraction, Interaction, MessageEmbed } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { COLOR_GREEN, COLOR_WHITE } from '../../colors';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel } from '../../models/MonsterUser';
import { chunk, format_number } from '../../utils';
import { userDex } from './info';
import { findMonsterByIDLocal, getPokedex, getUsersFavoriteMonsters, getUsersMonsters } from './monsters';

const logger = getLogger('Pokemon');

/**
 *
 * @param message
 */
export async function checkMonsters(interaction: Interaction, args: string[]): Promise<void> {
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
        `${interaction.user.username}'s Pokémon\nShowing: ${format_number(
          message_contents.length,
        ) +
          '/' +
          format_number(pokemon.length)}`,
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
    (interaction as BaseCommandInteraction).reply(`You don't have any monsters in your Pokédex. :(`)
      .then(() => {
        logger.debug(`${interaction.user.username} doesn't have any Pokémon!`);
        return;
      })
      .catch(async (err) => {
        logger.error(err);
      });
  }
}

export async function checkPokedex(interaction: Interaction, args: string[]): Promise<void> {
  const pokemon = await userDex(interaction.user.id);

  const pokedex = getPokedex();

  let msg_array = [];
  let pokemon_count = 0;

  const splitMsg = args;

  pokedex.forEach((dex) => {
    if (!dex.images || !dex.images.normal) return;
    let count = 0;
    if (pokemon.includes(dex.id)) {
      pokemon.forEach((monster) => {
        if (monster == dex.id) {
          count++;
        }
      });
      if (!args.includes('missing')) {
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

  if (splitMsg.length > 1 && !splitMsg[splitMsg.length - 1].match(/missing/i)) {
    const page = parseInt(splitMsg[splitMsg.length - 1]) - 1;

    if (all_monsters[page]) {
      msg_array = all_monsters[page];

      msg_array.push(
        `Page: **${page + 1}/${format_number(all_monsters.length)}**`,
      );
    }
  } else {
    msg_array = all_monsters[0];

    msg_array.push(`Page: **1/${format_number(all_monsters.length)}**`);
  }

  const new_msg = msg_array.join('\n');

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
export async function checkFavorites(interaction: Interaction, args: string[]): Promise<void> {
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
        `${interaction.user.username}'s Favorites\nShowing: ${format_number(
          message_contents.length,
        ) +
          '/' +
          format_number(pokemon.length)}\nTotal: ${format_number(
          pokemon.length,
        )}`,
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
    (interaction as BaseCommandInteraction).reply(`You don't have any favorite monsters in your Pokédex. :( Use \`!favorite ID\` to add one.`)
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
export async function searchMonsters(interaction: Interaction, args: string[]): Promise<void> {
  const splitMsg = args;
  const isQuote = false;
  let sort = ['iv', 'high'];
  let search = undefined;
  let page = 0;

  if (isQuote) {
    const parseSearch = args[0].replace(/ {2,}/gm, ' ').split('"');
    const splitSort = parseSearch[parseSearch.length - 1].split(' ');
    search = parseSearch[1].toLowerCase();
    if (splitSort.length == 3) {
      sort = [splitSort[1], splitSort[2]];
    } else if (splitSort.length == 4) {
      sort = [splitSort[1], splitSort[2]];
      page = parseInt(splitSort[splitSort.length - 1]) - 1;
    }
  } else {
    const parseSearch = args[0].replace(/ {2,}/gm, ' ').split(' ');
    sort = [splitMsg[2], splitMsg[3]];
    search = parseSearch[1].toLowerCase();
  }

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

      if (
        isQuote &&
        monster.name.english.toLowerCase().replace(/♂|♀/g, '') != search
      )
        return;

      if (
        !isQuote &&
        !monster.name.english
          .toLowerCase()
          .replace(/♂|♀/g, '')
          .match(splitMsg[1].toLowerCase())
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
        if (all_monsters[page]) {
          message_contents = all_monsters[page];
        }
      } else {
        message_contents = all_monsters[0];
      }

      const new_msg = message_contents.join('\n');

      const embed = new MessageEmbed()
        .setAuthor(
          `${
            interaction.user.username
          }'s search for '${search}' - Total: ${format_number(
            message_contents.length,
          ) +
            '/' +
            format_number(pokemon.length)} - Pages: ${format_number(
            all_monsters.length,
          )}`,
          interaction.user.avatarURL()?.toString(),
        )
        .setColor(0xff0000)
        .setDescription(new_msg);
      await interaction.channel
        .send({ embeds: [embed] })
        .then(() => {
          logger.debug(
            `Sent Pokémon for ${interaction.user.username} in ${interaction.guild?.name}!`,
          );
        })
        .catch(async (err) => {
          logger.error(err);
        });
    } else if (message_contents.length == 0) {
      (interaction as BaseCommandInteraction).reply(`Cannot find '${search}'.`);
    } else {
      const new_msg = message_contents.join('\n');

      const embed = new MessageEmbed()
        .setAuthor(
          `${
            interaction.user.username
          }'s search for '${search}' - Total: ${format_number(
            message_contents.length,
          ) +
            '/' +
            format_number(pokemon.length)}`,
          interaction.user.avatarURL()?.toString(),
        )
        .setColor(0xff0000)
        .setDescription(new_msg);
      await interaction.channel
        .send({ embeds: [embed] })
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
    (interaction as BaseCommandInteraction).reply(`You don't have any monsters in your Pokédex. :(`)
      .then(() => {
        logger.debug(`${interaction.user.username} doesn't have any Pokémon!`);
        return;
      })
      .catch(async (err) => {
        logger.error(err);
      });
  }
}
