import { SlashCommandBuilder } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { gtfo } from '../../smokeybot/smokeybot';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await gtfo(e.interaction);
}

export const names = ['gtfo'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("gtfo")
  .setDescription("GTFO");