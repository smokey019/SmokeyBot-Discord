import { Client, Message, TextChannel } from 'discord.js';
import { getLogger } from './logger';
import { cacheClient } from './cache';
import { getGuildSettings, putGuildSettings } from './database';
import { checkMonsters } from '../plugins/pokemon/check-monsters';
import {
  monsterInfo,
  monsterInfoLatest,
  monsterDex,
} from '../plugins/pokemon/info';
import { getCurrentTime, getRndInteger } from '../utils';
import { spawnMonster } from '../plugins/pokemon/spawn-monster';
import { catchMonster } from '../plugins/pokemon/catch-monster';
import { releaseMonster } from '../plugins/pokemon/release-monster';
import { toggleSmokeMon } from '../plugins/pokemon/options';

const logger = getLogger('DiscordClient');
let rateLimited = false;
const do_not_cache = [];

export const discordClient = new Client({ retryLimit: 5 });

discordClient.on('ready', () => {
  logger.info('Ready');
});

discordClient.on('rateLimit', (error) => {
  logger.warn('Rate Limited', error);

  rateLimited = true;

  setTimeout(() => {
    logger.info('Rate limit timeout elapsed.');
    rateLimited = false;
  }, error.timeout);
});

discordClient.on('message', async (message) => {
  try {
    await parseMessage(message);
  } catch (error) {
    logger.error(error);
  }
});

async function parseMessage(message: Message) {
  const timestamp = getCurrentTime();

  const channel_name = (message.channel as TextChannel).name;

  if (
    !message.member ||
    message.member.user.username == 'smokeybot' ||
    rateLimited
  ) {
    return;
  }

  const cache: any =
    message.guild != null ? await cacheClient.get(message.guild.id) : undefined;

  if (cache == null) {
    if (!do_not_cache.includes(message.guild?.id)) {
      do_not_cache.push(message.guild?.id);

      const settings: any =
        message.guild != null
          ? await getGuildSettings(message.guild.id)
          : undefined;

      if (settings == null) {
        putGuildSettings(message);
      } else {
        message.guild != null
          ? cacheClient.set(message.guild.id, {
              monster_spawn: {
                current_spawn: undefined,
                last_spawn: undefined,
                last_spawn_time: timestamp,
                msg: message,
              },
              settings: {
                id: settings.id,
                guild_id: settings.guild_id,
                smokemon_enabled: settings.smokemon_enabled,
                specific_channel: settings.specific_channel,
              },
              time: timestamp,
            })
          : undefined;

        logger.info(`Initialized cache for ${message.guild.name}.`);
      }
    }
  } else {
    if (timestamp - cache.time > 3) {
      const splitMsg = message.content.split(' ') || message.content;

      if (
        message.content.match(/~smokemon (enable|disable)/i) &&
        splitMsg[0].toLowerCase() == '~smokemon'
      ) {
        if (
          (splitMsg[1].toLowerCase() == 'enable' &&
            !cache.settings.smokemon_enabled) ||
          (splitMsg[1].toLowerCase() == 'disable' &&
            cache.settings.smokemon_enabled)
        ) {
          toggleSmokeMon(message, cache);
        }
      }
    }

    if (cache.settings.smokemon_enabled) {
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

      const spawn_timer = getRndInteger(getRndInteger(30, 120), 2400);

      if (timestamp - cache.monster_spawn.last_spawn_time > spawn_timer) {
        spawnMonster(message, cache);
      }
    }
  }
}
