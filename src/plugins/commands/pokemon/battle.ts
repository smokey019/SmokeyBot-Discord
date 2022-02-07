import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { battleParser } from '../../pokemon/battle';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await battleParser(e.interaction, e.args);
}

export const names = ['battle', 'test-battle', 'battle-test'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('battle')
  .setDescription('*TEST* Battle test.')
  .addStringOption((option) =>
    option.setName('input').setDescription('Debug').setRequired(true),
  );
