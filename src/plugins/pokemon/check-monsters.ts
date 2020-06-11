import { Message, MessageEmbed } from 'discord.js';

import { theWord } from '../../utils';
import { getLogger } from '../../clients/logger';
import { getAllMonsters } from './monsters';
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

  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      uid: message.author.id,
      released: 0,
    });

  if (pokemon.length > 0) {
    const monsters = getAllMonsters();
    let message_contents = [];
    let shiny = '';

    logger.debug(`Successfully fetched! Compiling..`);

    message_contents.push(`**Total ${theWord()}**: ${pokemon.length}\n`);

    pokemon.forEach((element: IMonsterModel) => {
      if (element.shiny) {
        shiny = ' <:star:719087649536606208>';
      } else {
        shiny = '';
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

      message_contents.push(
        `**${element.id}** - **${
          monsters[element.monster_id - 1].name.english
        }${shiny}** - **Level ${element.level}** - **Avg IV ${averageIV}%**`,
      );
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
      .catch(logger.error);
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
