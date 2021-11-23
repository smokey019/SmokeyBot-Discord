import { runEvent } from '..';
import { GLOBAL_COOLDOWN, reportCache } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  if (e.message.author.id != '90514165138989056') return;
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await reportCache(e.message);
}

export const names = ['cache-report'];
