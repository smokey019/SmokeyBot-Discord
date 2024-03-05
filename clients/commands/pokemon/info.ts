import { SlashCommandBuilder } from '@discordjs/builders';
import { TextChannel } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { queueMsg } from '../../emote_queue';
import {
  currentMonsterInfo,
  monsterInfo,
  monsterInfoLatest
} from '../../pokemon/info';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  const id = e.interaction.options.get('pokemon').toString();
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  if (id) {
    GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

    await monsterInfo(e.interaction, id);
  } else if (!id) {
    GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

    await currentMonsterInfo(e.interaction);
  } else if (id == 'latest' || id == 'l') {
    GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

    await monsterInfoLatest(e.interaction);
  } else {
    queueMsg('There was an error :\\ ', e.interaction, true);
  }
}

export const names = ['info', 'i'];

export const SlashCommandData = new SlashCommandBuilder()
  .setName('info')
  .setDescription("Check a Pokémon's info.")
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription(
        "Pokémon's smokeMon ID #. Leave blank to check your currently selected Pokémon.",
      ),
  );
