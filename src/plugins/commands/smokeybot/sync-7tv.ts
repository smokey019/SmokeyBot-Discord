import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { sync_7tv_emotes } from '../../smokeybot/emote-sync/sync-7tv-emotes';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await sync_7tv_emotes(e.interaction);
}

export const names = ['sync-emotes-7tv', 'sync-7tv'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('sync-7tv')
  .setDescription(
    "Upload your Twitch channel's 7TV Emotes to Discord. This won't replace existing emoji.",
  )
  .addStringOption((option) =>
    option
      .setName('channel')
      .setDescription('Twitch Channel')
      .setRequired(true),
  );
