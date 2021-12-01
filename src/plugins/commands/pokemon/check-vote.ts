import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { checkVote } from '../../../clients/top.gg';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  const channel_name = (e.message.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await checkVote(e.message);
}

export const names = ['check-vote', 'cv'];