import { databaseClient, getUser } from '../../clients/database';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { getPrefixes } from './parser';

export async function setNickname(interaction: Interaction): Promise<void> {
  const load_prefixes = await getPrefixes(interaction.guild.id);
  const prefixes = RegExp(load_prefixes.join('|'));
  const detect_prefix = interaction.content.match(prefixes);
  const prefix = detect_prefix.shift();
  const args = interaction.content
    .slice(prefix.length)
    .replace(/ {2,}/gm, ' ')
    .split(/ +/);

  const command = args.shift();

  const user = await getUser(interaction.user.id);
  // const monster = await getUserMonster(user.current_monster);

  if (args[1]?.trim() && command && user?.current_monster) {
    const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', user.current_monster)
      .update({ nickname: args[1] });

    if (updatedMonster) {
      (interaction as BaseCommandInteraction).reply('Nickname successfully set for your current monster!');
    } else {
      (interaction as BaseCommandInteraction).reply(
        'There was an error setting the nickname for your current monster.',
      );
    }
  } else if (!args[1]?.trim()) {
    (interaction as BaseCommandInteraction).reply('You have to set a valid nickname, idiot.');
  } else if (!user?.current_monster) {
    (interaction as BaseCommandInteraction).reply(
      "You don't have a monster currently selected or no monsters caught.",
    );
  }
}
