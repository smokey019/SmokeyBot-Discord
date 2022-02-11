import { SlashCommandBuilder } from '@discordjs/builders';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { toggleSmokeMon } from '../../pokemon/options';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await toggleSmokeMon(e.interaction, e.cache);
}

export const names = ['smokemon'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('smokemon')
  .setDescription(
    "Enable or Disable smokeMon in your Discord.",
  )
  .addBooleanOption((option) =>
    option
      .setName('toggle')
      .setDescription('True (enabled) or False (disabled)')
      .setRequired(true),
  );
