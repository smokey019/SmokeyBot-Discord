import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { checkVote } from '../../../clients/top.gg';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await checkVote(e.interaction);
}

export const names = ['check-vote', 'cv'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('vote-check')
  .setDescription(
    'If you voted on Top.GG for SmokeyBot then use this to check and receive your gifts.',
  );
