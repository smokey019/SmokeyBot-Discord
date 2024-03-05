import { CommandInteraction } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { MonsterTable, type IMonsterModel } from '../../models/Monster';
import { queueMsg } from '../emote_queue';

export async function setNickname(
  interaction: CommandInteraction,
): Promise<void> {
  const nick = interaction.options.get('pokemon').toString();

  const user = await getUser(interaction.user.id);

  if (nick.trim() && user.current_monster) {
    const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', user.current_monster)
      .update({ nickname: nick });

    if (updatedMonster) {
      queueMsg(
        'Nickname successfully set for your current monster!',
        interaction,
        true,
      );
    } else {
      queueMsg(
        'There was an error setting the nickname for your current monster.',
        interaction,
        true,
      );
    }
  } else if (!nick?.trim()) {
    queueMsg('You have to set a valid nickname, idiot.', interaction, true);
  } else if (!user?.current_monster) {
    queueMsg(
      "You don't have a monster currently selected or no monsters caught.",
      interaction,
      true,
    );
  }
}
