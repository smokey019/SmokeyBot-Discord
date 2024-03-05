import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { checkLeaderboard } from '../../pokemon/leaderboard';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());
  await checkLeaderboard(e.interaction);
}

export const names = ['leaderboard'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Check the leaderboard and see leading Pokemon stats.')
	.addStringOption(option =>
		option.setName('input')
			.setDescription('What to filter the leaderboard by. ie: iv high'));
