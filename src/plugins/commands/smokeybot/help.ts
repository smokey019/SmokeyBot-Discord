import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { queueMsg } from '../../../clients/queue';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  queueMsg(
    'For a list of commands check this link out: https://www.smokey.gg/tutorials/smokeybot-commands/',
    e.interaction,
    true,
  );
}

export const names = ['help', 'commands'];
