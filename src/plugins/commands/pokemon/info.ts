import { TextChannel } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import {
  currentMonsterInfo,
  monsterInfo,
  monsterInfoLatest
} from '../../pokemon/info';

export async function run(e: runEvent) {
  const channel_name = (e.message.channel as TextChannel).name;
  if (!e.cache.settings.smokemon_enabled || channel_name != e.cache.settings.specific_channel) return;
  if (e.args[0]?.match(/\d+/)) {
    GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

    await monsterInfo(e.message);
  } else if (e.args.length == 0) {
    GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

    await currentMonsterInfo(e.message);
  } else if (e.args[0] == 'latest' || e.args[0] == 'l') {
    GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

    await monsterInfoLatest(e.message);
  }
}

export const names = ['info', 'i'];
