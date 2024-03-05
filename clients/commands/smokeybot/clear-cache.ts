import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN, clearCache } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  if (e.interaction.user.id != '90514165138989056') return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await clearCache(e.args[0]);
}

export const names = ['clear'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Cache report. Smokey use only.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);