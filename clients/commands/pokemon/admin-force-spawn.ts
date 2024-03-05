import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { forceSpawn } from '../../pokemon/spawn-monster';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  if (e.interaction.user.id == '90514165138989056') {
    await forceSpawn(e.interaction, e.cache);
    await e.interaction.reply({ content: '👍', ephemeral: true });
  } else {
    await e.interaction.reply({ content: '😠 nt', ephemeral: true });
  }
}

export const names = ['fspawn'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('fspawn')
  .setDescription(
    'Force spawn Pokémon. SmokeyBot Admin only command for debugging.',
  )
  .addStringOption((option) =>
    option.setName('pokemon').setDescription("Pokémon's ID.").setRequired(true),
  );
