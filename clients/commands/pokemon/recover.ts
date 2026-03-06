import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { recoverMonster } from '../../pokemon/release-monster';
import { isSpawnChannel } from '../../pokemon/utils';

export async function run(e: runEvent) {
  const channel = e.interaction.channel as TextChannel;
  if (
    !e.cache.settings.smokemon_enabled ||
    !isSpawnChannel(channel.id, channel.name, e.cache.settings.specific_channel)
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await recoverMonster(e.interaction);
}

export const names = ['recover'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('recover')
  .setDescription("Recover your released Pokémon.")
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription(
        "Pokémon's smokeMon ID #.",
      ),
  );
