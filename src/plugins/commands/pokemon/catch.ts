import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { catchMonster } from '../../../plugins/pokemon/catch-monster';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  await catchMonster(e.interaction, e.args[0], e.cache);
}

export const names = ['catch', 'キャッチ', '抓住', 'capture'];

export const SlashCommandData = new SlashCommandBuilder()
	.setName('catch')
	.setDescription('Catch a Pokémon! Type their name properly to successfully catch.')
	.addStringOption(option =>
		option.setName('input')
			.setDescription('Pokémon\'s name.')
			.setRequired(true));
