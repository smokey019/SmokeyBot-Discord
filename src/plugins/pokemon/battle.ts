import { Message, MessageEmbed } from 'discord.js';
import { img_monster_ball } from './utils';
import { COLOR_RED } from '../../colors';

async function monsterChooseAbility(message: Message) {
  const embed = new MessageEmbed()
    .setAuthor(`Battle - Monster1 vs Monster2`, img_monster_ball)
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
  await message.channel
    .send(embed)
    .then((message) => {
      return message;
    })
    .catch(console.error);
}

export async function battleParser(message: Message): Promise<void> {
  if (message.content == '~battle test') {
    monsterChooseAbility(message);
  }
}
