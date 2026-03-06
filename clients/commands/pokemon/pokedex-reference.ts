import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { monsterDex } from '../../pokemon/info';
import { isSpawnChannel } from '../../pokemon/utils';

export async function run(e: runEvent) {
  const channel = e.interaction.channel as TextChannel;
  if (
    !e.cache.settings.smokemon_enabled ||
    !isSpawnChannel(channel.id, channel.name, e.cache.settings.specific_channel)
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await monsterDex(e.interaction);
}

export const names = ['dex', 'd'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('dex')
  .setDescription('Check the Pokedex information of a particular Pokémon.')
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription("Pokémon's name.")
      .setRequired(true),
  );
