import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { forceSpawn } from '../../pokemon/spawn-monster';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  if (e.interaction.user.id == '90514165138989056') {
    await forceSpawn(e.interaction, e.cache);
  }
}

export const names = ['fspawn'];
