import { Client, Message } from 'discord.js';
import { getLogger } from './logger';
import { ICache, getGCD, getCache } from './cache';
import { getGuildSettings, IGuildSettings } from './database';
import { getCurrentTime, getRndInteger } from '../utils';
import { spawnMonster } from '../plugins/pokemon/spawn-monster';
import { monsterParser } from '../plugins/pokemon/parser';
import { smokeybotParser } from '../plugins/smokeybot/parser';

const logger = getLogger('DiscordClient');
let rateLimited = false;

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

  const settings: IGuildSettings = await getGuildSettings(message);

  const cache: ICache = await getCache(message, settings);

  const GCD: number = await getGCD(message.guild.id);

  if (cache && settings) {
    if (message.author.bot) return;

    if (timestamp - GCD > 5) {
      await smokeybotParser(message, cache);
    }

    if (cache.settings.smokemon_enabled) {
      await monsterParser(message, cache);

      const spawn_timer = getRndInteger(30, 1800);

      if (timestamp - cache.monster_spawn.last_spawn_time > spawn_timer) {
        await spawnMonster(message, cache);
      }
    }
  } else if (!cache) {
    logger.error(
      `Missing cache for ${message.guild.id} - ${message.guild.name}.`,
    );
  } else if (!settings) {
    logger.error(
      `Missing settings for ${message.guild.id} - ${message.guild.name}.`,
    );
  }
}
