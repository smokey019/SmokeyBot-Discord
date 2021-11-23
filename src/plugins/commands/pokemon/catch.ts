import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { catchMonster } from '../../../plugins/pokemon/catch-monster';

export async function run(e: runEvent) {
  const channel_name = (e.message.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  await catchMonster(e.message, e.cache);
}

export const names = ['catch', 'キャッチ', '抓住', 'capture'];
