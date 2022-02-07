import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { spawnMonster } from '../../pokemon/spawn-monster';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  if (e.interaction.user.id == '90514165138989056') {
    await spawnMonster(e.interaction, e.cache);
    await e.interaction.reply({ content: '👍', ephemeral: true });
  } else {
    await e.interaction.reply({ content: '😠 nt', ephemeral: true });
  }
}

export const names = ['spawn'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('spawn')
  .setDescription(
    'Spawn a Pokémon. SmokeyBot Admin only command for debugging.',
  );
