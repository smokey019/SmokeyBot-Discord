import { SlashCommandBuilder } from '@discordjs/builders';
import type { runEvent } from '..';
import { getCurrentTime } from '../../../utils';
import { GLOBAL_COOLDOWN } from '../../cache';
import { createQueueStatsEmbed } from '../../message_queue/report';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  const embed = await createQueueStatsEmbed(e.interaction);
  await e.interaction.reply({ embeds: [embed] });
}

export const names = ['stats-messages'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('stats-messages')
  .setDescription('Show SmokeyBot message statistics.');
