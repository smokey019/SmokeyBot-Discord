import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { releaseMonsterNew } from '../../pokemon/release-monster';

export async function run(e: runEvent) {
  await releaseMonsterNew(e.interaction);
}

export const names = ['release', 'r'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('release')
  .setDescription('Release a Pokémon.')
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription(
        "Pokémon's smokeMon ID #. Leave blank to release latest catch.",
      ),
  );
