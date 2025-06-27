import { SlashCommandBuilder } from '@discordjs/builders';
import type { runEvent } from '..';
import { getCurrentTime } from '../../../utils';
import { GLOBAL_COOLDOWN } from '../../cache';
import { displayQueueStats } from '../../emote_queue';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await e.interaction.deferReply();
  await displayQueueStats(e.interaction);
}

export const names = ['stats-emotes'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('stats-emotes')
  .setDescription('Show SmokeyBot emote statistics.');
