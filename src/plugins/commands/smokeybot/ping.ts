import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { queueMsg } from '../../../clients/queue';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  const ping = Date.now() - e.interaction.createdTimestamp;
  queueMsg(`Pong! ${ping} ms.`, e.interaction, true);
}

export const names = ['ping'];
