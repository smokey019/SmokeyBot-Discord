import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { checkPokedex } from '../../pokemon/check-monsters';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await checkPokedex(e.interaction);
}

export const names = ['pokedex'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('pokedex')
  .setDescription('Check your Pokedex to see what Pokémon you have.')
  .addBooleanOption((option) =>
    option.setName('missing').setDescription('Show only missing Pokémon.'),
  );
