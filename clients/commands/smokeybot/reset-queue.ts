import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { resetQueue } from '../../emote_queue';

export async function run(e: runEvent) {
  if (e.interaction.user.id != '90514165138989056') return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await resetQueue(e.interaction.options.get('which').value.toString().toLowerCase().trim(), e.interaction);
}

export const names = ['reset-queue'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("reset-queue")
  .setDescription("Reset queue. Smokey use only.")
  .addStringOption((option) =>
    option
      .setName('which')
      .setDescription('"EMOTE" or "MESSAGE" queue. Smokey use only.')
      .setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
