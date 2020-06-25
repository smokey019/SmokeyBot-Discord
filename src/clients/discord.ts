import { Client, Message } from 'discord.js';
import { getLogger } from './logger';
import { cacheClient, ICache } from './cache';
import { getGuildSettings, putGuildSettings, IGuildSettings } from './database';
import { getCurrentTime, getRndInteger } from '../utils';
import { spawnMonster } from '../plugins/pokemon/spawn-monster';
import { monsterParser } from '../plugins/pokemon/parser';
import { smokeybotParser } from '../plugins/smokeybot/parser';

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

  if (
    !message.member ||
    message.member.user.username == 'smokeybot' ||
    rateLimited
  ) {
    return;
  }

  const cache: ICache =
    message.guild != null ? await cacheClient.get(message.guild.id) : undefined;

  if (cache == null) {
    if (!do_not_cache.includes(message.guild?.id)) {
      do_not_cache.push(message.guild?.id);

      const settings: IGuildSettings =
        message.guild != null
          ? await getGuildSettings(message.guild.id)
          : undefined;

      if (settings == null) {
        putGuildSettings(message);
      } else {
        message.guild != null
          ? cacheClient.set(message.guild.id, {
              tweet: [],
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
      smokeybotParser(message, cache);
    }

    if (cache.settings.smokemon_enabled) {
      monsterParser(message, cache);

      const spawn_timer = getRndInteger(getRndInteger(30, 120), 1200);

      if (timestamp - cache.monster_spawn.last_spawn_time > spawn_timer) {
        spawnMonster(message, cache);
      }
    }
  }
}
