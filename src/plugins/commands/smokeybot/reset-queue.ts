import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { resetQueue } from '../../../clients/queue';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  if (e.interaction.user.id != '90514165138989056') return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await resetQueue(e.args[0], e.interaction);
}

export const names = ['cache-report'];
