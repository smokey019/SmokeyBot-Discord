import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { setNickname } from '../../pokemon/nickname';

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  if (e.args[0] == 'set') {
    GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());
    await setNickname(e.interaction);
  }
}

export const names = ['nick', 'nickname'];
