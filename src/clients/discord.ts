import { Client, Message, TextChannel } from 'discord.js';
import { getLogger } from './logger';
import { cacheClient } from './cache';
import { getGuildSettings, putGuildSettings } from './database';
import { checkMonsters } from '../plugins/pokemon/check-monsters';
import { monsterInfo, monsterInfoLatest } from '../plugins/pokemon/info';
import { getCurrentTime, getRndInteger } from '../utils';
import { spawnMonster } from '../plugins/pokemon/spawn-monster';
import { catchMonster } from '../plugins/pokemon/catch-monster';
import { releaseMonster } from '../plugins/pokemon/release-monster';

const logger = getLogger('DiscordClient');
let rateLimited = false;
const do_not_cache = [];

export const discordClient = new Client({ retryLimit: 5 });

discordClient.on('ready', () => {
  logger.debug('Ready');
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

        logger.debug(`Initialized cache for ${message.guild.name}.`);
      }
    }
  } else {
    if (cache.settings.smokemon_enabled) {
      if (timestamp - cache.time > 3) {
        if (
          message.content.toLowerCase() == '~pokemon' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          checkMonsters(message);
        } else if (
          message.content.match(/~info (\d+)/i) &&
          message.content.toLowerCase() != '~info latest' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          monsterInfo(message);
        } else if (
          message.content.match(/~info latest/i) &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          monsterInfoLatest(message);
        } else if (
          cache.monster_spawn.current_spawn &&
          message.content.match(/~catch/i) &&
          channel_name == cache.settings.specific_channel
        ) {
          catchMonster(message, cache);
        }
      } else if (
        message.content.match(/~release/i) &&
        channel_name == cache.settings.specific_channel
      ) {
        cache.time = getCurrentTime();

        cacheClient.set(message.guild.id, {
          ...cache,
          time: getCurrentTime(),
        });

        console.log("we're here");
        releaseMonster(message);
      } else if (timestamp - cache.time < 3) {
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

      const spawn_timer = getRndInteger(30, 1200);

      if (timestamp - cache.monster_spawn.last_spawn_time > spawn_timer) {
        spawnMonster(message, cache);
      }
    }
  }
}
