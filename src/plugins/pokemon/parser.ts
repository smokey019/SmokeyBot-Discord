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
import { checkMonsters, checkFavorites } from './check-monsters';
import { releaseMonster, recoverMonster } from './release-monster';
import { selectMonster, setFavorite, unFavorite } from './monsters';
import { checkExpGain } from './exp-gain';
import { getLogger } from '../../clients/logger';
import { parseTrade } from './trading';

const logger = getLogger('Pokemon');

export async function monsterParser(
  message: Message,
  cache: ICache,
): Promise<any> {
  const timestamp = getCurrentTime();

  const channel_name = (message.channel as TextChannel).name;
  const splitMsg = message.content.split(' ') || message.content;

  if (
    cache.monster_spawn.current_spawn &&
    message.content.match(/~catch/i) &&
    splitMsg[0].toLowerCase() == '~catch' &&
    channel_name == cache.settings.specific_channel &&
    splitMsg.length > 1
  ) {
    catchMonster(message, cache);
  }

  if (timestamp - cache.time > 3) {
    if (
      message.content.match(/~unique/i) &&
      splitMsg[0].toLowerCase() == '~unique'
    ) {
      const tempdex = await userDex(message);
      message.reply(
        `You have ${tempdex.length} total unique ${theWord()} in your Pokédex.`,
      );
    }

    if (
      message.content.match(/~trade/i) &&
      splitMsg[0].toLowerCase() == '~trade' &&
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
      message.content.match(/~dex/i) &&
      splitMsg[0].toLowerCase() == '~dex' &&
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
      splitMsg[0].toLowerCase() == '~pokemon' &&
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
      message.content.match(/~info (\d+)/i) &&
      splitMsg[0] == '~info' &&
      message.content.toLowerCase() != '~info latest' &&
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
      message.content.match(/~info latest/i) &&
      splitMsg[0].toLowerCase() == '~info' &&
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
      message.content.match(/~info/i) &&
      splitMsg[0].toLowerCase() == '~info' &&
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
      message.content.match(/~release/i) &&
      splitMsg[0].toLowerCase() == '~release' &&
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
      message.content.match(/~recover/i) &&
      splitMsg[0].toLowerCase() == '~recover' &&
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
      message.content.match(/~select/i) &&
      splitMsg[0].toLowerCase() == '~select' &&
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
      message.content.match(/~favorites/i) &&
      splitMsg[0].toLowerCase() == '~favorites' &&
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
      message.content.match(/~favorite/i) &&
      splitMsg[0].toLowerCase() == '~favorite' &&
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
      message.content.match(/~unfavorite/i) &&
      splitMsg[0].toLowerCase() == '~unfavorite' &&
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
      (message.content.match(/~release/i) &&
        channel_name == cache.settings.specific_channel) ||
      (message.content.match(/~pokemon/i) &&
        channel_name == cache.settings.specific_channel) ||
      (message.content.match(/~info/i) &&
        channel_name == cache.settings.specific_channel)
    ) {
      logger.debug(`${message.guild.name} - Cooldown present.`);
      return;
    }
  }
}
