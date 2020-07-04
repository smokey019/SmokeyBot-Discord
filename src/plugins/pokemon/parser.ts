import { Message, TextChannel } from 'discord.js';
import { ICache, cacheClient } from '../../clients/cache';
import { catchMonster } from './catch-monster';
import {
  userDex,
  monsterDex,
  monsterInfo,
  monsterInfoLatest,
  currentMonsterInfo,
} from './info';
import { theWord, getCurrentTime } from '../../utils';
import {
  checkMonsters,
  checkFavorites,
  searchMonsters,
} from './check-monsters';
import { releaseMonster, recoverMonster } from './release-monster';
import { selectMonster, setFavorite, unFavorite } from './monsters';
import { checkExpGain } from './exp-gain';
import { getLogger } from '../../clients/logger';
import { parseTrade } from './trading';
import { parseItems, msgBalance } from './items';

const logger = getLogger('Pokemon');

export const prefixes = ['!', '~', 'p!'];
export function prefix_regex(command: string): RegExp {
  return RegExp('(' + prefixes.join('|') + ')' + command, 'i');
}

export async function monsterParser(
  message: Message,
  cache: ICache,
): Promise<any> {
  const timestamp = getCurrentTime();

  const channel_name = (message.channel as TextChannel).name;
  const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');
  const command = splitMsg[0];

  if (
    cache.monster_spawn.current_spawn &&
    command.match(prefix_regex('catch')) &&
    channel_name == cache.settings.specific_channel &&
    splitMsg.length > 1
  ) {
    catchMonster(message, cache);
  }

  if (timestamp - cache.time > 3) {
    if (command.match(prefix_regex('unique'))) {
      const tempdex = await userDex(message);
      message.reply(
        `You have ${tempdex.length} total unique ${theWord()} in your Pokédex.`,
      );
    }

    if (
      (command.match(prefix_regex('bal')) &&
        channel_name == cache.settings.specific_channel) ||
      (command.match(prefix_regex('balance')) &&
        channel_name == cache.settings.specific_channel) ||
      (command.match(prefix_regex('currency')) &&
        channel_name == cache.settings.specific_channel) ||
      (command.match(prefix_regex('bank')) &&
        channel_name == cache.settings.specific_channel)
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      msgBalance(message);
    }

    if (
      command.match(prefix_regex('item')) &&
      channel_name == cache.settings.specific_channel &&
      splitMsg.length > 1
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      parseItems(message);
    }

    if (
      command.match(prefix_regex('trade')) &&
      channel_name == cache.settings.specific_channel &&
      splitMsg.length > 1
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      parseTrade(message);
    }

    if (
      command.match(prefix_regex('dex')) &&
      channel_name == cache.settings.specific_channel &&
      splitMsg.length > 1
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      monsterDex(message);
    }

    if (
      command.match(prefix_regex('search')) &&
      channel_name == cache.settings.specific_channel &&
      splitMsg.length > 1
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      searchMonsters(message);
    }
    if (
      command.match(prefix_regex('pokemon')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      checkMonsters(message);
    }

    if (
      message.content.match(prefix_regex('info (\\d+)')) &&
      !message.content.match(/info latest/i) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      monsterInfo(message);
    }

    if (
      message.content.match(prefix_regex('info latest')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      monsterInfoLatest(message);
    }

    if (
      command.match(prefix_regex('info')) &&
      splitMsg.length == 1 &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      currentMonsterInfo(message);
    }

    if (
      command.match(prefix_regex('release')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      releaseMonster(message);
    }

    if (
      command.match(prefix_regex('recover')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      recoverMonster(message);
    }

    if (
      command.match(prefix_regex('select')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      selectMonster(message);
    }

    if (
      command.match(prefix_regex('favorites')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      checkFavorites(message);
    }

    if (
      command.match(prefix_regex('favorite')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      setFavorite(message);
    }

    if (
      command.match(prefix_regex('unfavorite')) &&
      channel_name == cache.settings.specific_channel
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });

      unFavorite(message);
    }

    checkExpGain(message);
  }

  if (timestamp - cache.time < 3) {
    if (
      (command.match(prefix_regex('release')) &&
        channel_name == cache.settings.specific_channel) ||
      (command.match(prefix_regex('pokemon')) &&
        channel_name == cache.settings.specific_channel) ||
      (command.match(prefix_regex('info')) &&
        channel_name == cache.settings.specific_channel)
    ) {
      logger.debug(`${message.guild.name} - Cooldown present.`);
      return;
    }
  }
}
