import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { forceSpawn } from '../../pokemon/spawn-monster';

export async function run(e: runEvent) {
  const channel_name = (e.message.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  if (e.message.author.id == '90514165138989056') {
    await forceSpawn(e.message, e.cache);
  }
}

export const names = ['fspawn'];
