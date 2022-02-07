import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { checkMonstersNew } from '../../pokemon/check-monsters';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await checkMonstersNew(e.interaction);
}

export const names = ['pokemon', 'p'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('pokemon')
  .setDescription('Show your Pokémon.')
  .addStringOption((option) =>
    option
      .setName('options')
      .setDescription('Choose an option to sort your Pokémon by.')
      .addChoice('IV High', 'iv_high')
      .addChoice('IV Low', 'iv_low')
      .addChoice('Level High', 'level_high')
      .addChoice('Level Low', 'level_low')
      .addChoice('smokeMon ID High', 'id_high')
      .addChoice('smokeMon ID Low', 'id_low')
      .addChoice('Name Ascending', 'name_high')
      .addChoice('Name Descending', 'name_low'),
  );
