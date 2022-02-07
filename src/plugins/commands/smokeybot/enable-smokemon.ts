import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { toggleSmokeMon } from '../../pokemon/options';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await toggleSmokeMon(e.interaction, e.args, e.cache);
}

export const names = ['smokemon'];
