import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { checkFavorites } from '../../pokemon/check-monsters';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await checkFavorites(e.interaction);
}

export const names = ['favorites', 'favourites', 'favs'];
