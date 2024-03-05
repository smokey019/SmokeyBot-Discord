import { SlashCommandBuilder } from '@discordjs/builders';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { getBotStats } from '../../pokemon/utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await getBotStats(e.interaction);
}

export const names = ['stats'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show SmokeyBot statistics.');
