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

  await checkMonstersNew(e.interaction, 1);
}

export const names = ['favorites', 'favourites', 'favs'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('favorites')
  .setDescription('Show your favorite Pokémon.')
  .addStringOption((option) =>
    option
      .setName('options')
      .setDescription('Choose an option to sort your Pokémon by.')
      .addChoice('IV, Latest Caught First', 'iv_latest')
      .addChoice('IV, Oldest Caught First', 'iv_oldest')
      .addChoice('Level, Latest Caught First', 'level_latest')
      .addChoice('Level, Oldest Caught First', 'level_oldest')
      .addChoice('smokeMon ID, Latest Caught First', 'id_latest')
      .addChoice('smokeMon ID, Oldest Caught First', 'id_oldest')
      .addChoice('Name, Latest Caught First', 'name_latest')
      .addChoice('Name, Oldest Caught First', 'name_oldest'),
  );
