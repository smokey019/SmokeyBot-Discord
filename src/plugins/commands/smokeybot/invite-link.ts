import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { queueMsg } from '../../../clients/queue';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  queueMsg(`To invite SmokeyBot into your Discord, click here: https://discord.com/oauth2/authorize?client_id=458710213122457600&permissions=1073743936&scope=bot%20applications.commands`, e.interaction, true);
}

export const names = ['invite'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('Show SmokeyBot invite link.');
