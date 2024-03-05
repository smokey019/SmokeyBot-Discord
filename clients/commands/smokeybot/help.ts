import { SlashCommandBuilder } from '@discordjs/builders';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  e.interaction.reply(
    'For a list of commands check this link out: https://www.smokey.gg/tutorials/smokeybot-commands/'
  );
}

export const names = ['help', 'commands'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show SmokeyBot commands.');
