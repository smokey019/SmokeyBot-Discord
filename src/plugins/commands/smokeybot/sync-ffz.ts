import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { sync_ffz_emotes } from '../../smokeybot/emote-sync/sync-ffz-emotes';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await sync_ffz_emotes(e.message);
}

export const names = ['sync-emotes-ffz', 'sync-ffz'];
