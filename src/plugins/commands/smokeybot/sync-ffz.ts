import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { sync_ffz_emotes } from '../../smokeybot/emote-sync/sync-ffz-emotes';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await sync_ffz_emotes(e.interaction, e.args[0]);
}

export const names = ['sync-emotes-ffz', 'sync-ffz'];
