import { SlashCommandBuilder } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  const ping = Date.now() - e.interaction.createdTimestamp;
  e.interaction.reply(`Pong! ${ping} ms.`);
}

export const names = ['ping'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("PONG");