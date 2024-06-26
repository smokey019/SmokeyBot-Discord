import { SlashCommandBuilder } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { sumSmash } from '../../smokeybot/smokeybot';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await sumSmash(e.interaction);
}

export const names = ['smash'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("smash")
  .setDescription("sumSmash");
