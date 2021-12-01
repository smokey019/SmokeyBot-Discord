import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await e.message.reply(
    'For a list of commands check this link out: https://www.smokey.gg/tutorials/smokeybot-commands/',
  );
}

export const names = ['help', 'commands'];
