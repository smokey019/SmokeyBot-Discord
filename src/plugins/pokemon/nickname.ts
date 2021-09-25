import { Message } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { getPrefixes } from './parser';

export async function setNickname(message: Message): Promise<void> {
  const load_prefixes = await getPrefixes(message.guild.id);
  const prefixes = RegExp(load_prefixes.join('|'));
  const detect_prefix = message.content.match(prefixes);
  const prefix = detect_prefix.shift();
  const args = message.content
    .slice(prefix.length)
    .replace(/ {2,}/gm, ' ')
    .split(/ +/);

  const command = args.shift();

  const user = await getUser(message.author.id);
  // const monster = await getUserMonster(user.current_monster);

  if (args[1]?.trim() && command && user?.current_monster) {
    const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', user.current_monster)
      .update({ nickname: args[1] });

    if (updatedMonster) {
      message.reply('Nickname successfully set for your current monster!');
    } else {
      message.reply(
        'There was an error setting the nickname for your current monster.',
      );
    }
  } else if (!args[1]?.trim()) {
    message.reply('You have to set a valid nickname, idiot.');
  } else if (!user?.current_monster) {
    message.reply(
      "You don't have a monster currently selected or no monsters caught.",
    );
  }
}
