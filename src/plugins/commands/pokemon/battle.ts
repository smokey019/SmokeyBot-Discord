import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { battleParser } from '../../pokemon/battle';

export async function run(e: runEvent) {
  const channel_name = (e.message.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await battleParser(e.message);
}

export const names = ['battle', 'test-battle', 'battle-test'];
