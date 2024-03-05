import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { selectMonster } from '../../pokemon/monsters';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await selectMonster(e.interaction);
}

export const names = ['select', 'sel', 'pick', 'main'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('select')
  .setDescription(
    'Select a Pokémon to level while you talk in Discord text channels.',
  )
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription("Pokémon's smokeMon ID #.")
      .setRequired(true),
  );
