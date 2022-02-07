import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { cancel_sync } from '../../smokeybot/emote-sync/sync-ffz-emotes';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await cancel_sync(e.interaction);
}

export const names = ['cancel-sync', 'cancel'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('cancel-sync')
  .setDescription(
    "Cancel the uploading of your emotes.",
  );
