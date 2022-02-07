import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { setNickname } from '../../pokemon/nickname';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());
  await setNickname(e.interaction);
}

export const names = ['nick', 'nickname'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('nickname')
  .setDescription('Set a nickname for your Pokémon.')
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription("Pokémon's nickname.")
      .setRequired(true),
  );
