import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { catchMonster } from '../../pokemon/catch-monster';
import { isSpawnChannel } from '../../pokemon/utils';

export async function run(e: runEvent) {
  const channel = e.interaction.channel as TextChannel;
  if (
    !e.cache.settings.smokemon_enabled ||
    !isSpawnChannel(channel.id, channel.name, e.cache.settings.specific_channel)
  )
    return;
  await catchMonster(e.interaction);
}

export const names = ['catch', 'キャッチ', '抓住', 'capture'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('catch')
  .setDescription(
    'Catch a Pokémon! Type their name properly to successfully catch. ie: /catch Bulbasaur',
  )
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription("Pokémon's name.")
      .setRequired(true),
  );
