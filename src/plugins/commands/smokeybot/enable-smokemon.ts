import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { toggleSmokeMon } from '../../pokemon/options';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  if (!(await toggleSmokeMon(e.message, e.cache))) {
    await e.message.reply(
      'There was an error. You might not have permission to do this.',
    );
  }
}

export const names = ['smokemon'];
