import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { checkVote } from '../../../clients/top.gg';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await checkVote(e.interaction);
}

export const names = ['check-vote', 'cv'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('check-vote')
  .setDescription(
    'If you voted on Top.GG for SmokeyBot then use this to check and receive your gifts.',
  );
