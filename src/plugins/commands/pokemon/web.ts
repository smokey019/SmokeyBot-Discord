import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { queueMsg } from '../../../clients/queue';

export async function run(e: runEvent) {

	queueMsg(`Here is your web profile URL: https://bot.smokey.gg/user/${e.interaction.user.id}/pokemon`, e.interaction, true, 1);
}

export const names = ['web'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('web')
  .setDescription('Get a link to your profile on the website. (Coming soon!)');
