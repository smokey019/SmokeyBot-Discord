import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { checkServerWeather } from '../../pokemon/utils';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());
  await checkServerWeather(e.interaction, e.cache);
}

export const names = ['weather', 'check-weather'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('weather')
  .setDescription('Check the weather and currently boosted Pokémon types.');
