import { SlashCommandBuilder } from '@discordjs/builders';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { queueMsg } from '../../emote_queue';

export async function run(e: runEvent) {

  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

	queueMsg(`Here is your web profile URL: https://bot.smokey.gg/user/${e.interaction.user.id}/pokemon`, e.interaction, true, 1);
}

export const names = ['web'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('web')
  .setDescription('Get a link to your profile on the website. (Coming soon!)');
