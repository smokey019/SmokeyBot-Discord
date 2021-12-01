import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { sync_7tv_emotes } from '../../smokeybot/emote-sync/sync-7tv-emotes';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await sync_7tv_emotes(e.message, e.args[0]);
}

export const names = ['sync-emotes-7tv', 'sync-7tv'];
