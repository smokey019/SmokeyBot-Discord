import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { runEvent } from '..';
import { getCurrentTime } from '../../../utils';
import { GLOBAL_COOLDOWN } from '../../cache';
import { ResetEmoteTimer } from '../../emote_queue';

export async function run(e: runEvent) {
  if (
    !e.interaction ||
    !e.interaction.guild ||
    e.interaction.user.id != "90514165138989056"
  )
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await e.interaction.deferReply();
  await ResetEmoteTimer(e.interaction);
}

export const names = ['z-admin-reset-emote-timer'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("z-admin-reset-emote-timer")
  .setDescription("Reset emote timer. Smokey use only.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
