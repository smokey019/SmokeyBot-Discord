import { MessageEmbed } from 'discord.js';
import { getLogger } from '../../clients/logger';
import { COLOR_RED } from '../../colors';
import { img_monster_ball } from './utils';

const logger = getLogger('Battles');

async function monsterChooseAbility(interaction: Interaction) {
  const embed = new MessageEmbed()
    .setAuthor(`Battle - Mew vs Mewtwo`, img_monster_ball)
    .setColor(COLOR_RED)
    .setImage(
      `https://www.pokencyclopedia.info/sprites/3ds/ani-b_6/3a-b__150__xy.gif`,
    )
    .setThumbnail(
      `https://www.pokencyclopedia.info/sprites/3ds/ani_6/3ani__151__xy.gif`,
    )
    .addFields(
      { name: '**0**', value: 'Ability 0' },
      { name: '**1**', value: 'Ability 1' },
      { name: '**2**', value: 'Escape' },
      { name: '\u200B', value: '\u200B' },
      {
        name: "**Mewtwo's HP**",
        value: `100/420`,
        inline: true,
      },
      {
        name: "**Mew's HP**",
        value: `100/420`,
        inline: true,
      },
    )
    .setDescription(`USER1's Turn! Pick an ability to use.`);
  await interaction.channel
    .send({ embeds: [embed] })
    .then((interaction) => {
      return message;
    })
    .catch((err) => {
      logger.error(err);
    });
}

export async function battleParser(interaction: Interaction): Promise<void> {
  if (interaction.content == '~battle test') {
    monsterChooseAbility(message);
  }
}
