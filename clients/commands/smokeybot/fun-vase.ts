import { SlashCommandBuilder } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { checkVase } from '../../smokeybot/smokeybot';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await checkVase(e.interaction);
}

export const names = ['vase'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("vase")
  .setDescription("moms vase");
