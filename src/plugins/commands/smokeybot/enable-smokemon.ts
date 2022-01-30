import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { toggleSmokeMon } from '../../pokemon/options';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  if (!(await toggleSmokeMon(e.interaction, e.cache))) {
    await e.interaction.reply(
      'There was an error. You might not have permission to do this.',
    );
  }
}

export const names = ['smokemon'];
