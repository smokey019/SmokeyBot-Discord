import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { recoverMonster } from '../../pokemon/release-monster';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await recoverMonster(e.interaction);
}

export const names = ['recover'];
