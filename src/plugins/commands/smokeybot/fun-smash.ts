import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { sumSmash } from '../../smokeybot/smokeybot';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await sumSmash(e.message);
}

export const names = ['smash'];
