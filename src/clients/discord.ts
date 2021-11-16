import { Client, Intents, Message } from 'discord.js';
import { getAllMonsters, MonsterDex } from '../plugins/pokemon/monsters';
import { monsterParser } from '../plugins/pokemon/parser';
import { MONSTER_SPAWNS, spawnMonster } from '../plugins/pokemon/spawn-monster';
import { smokeybotParser } from '../plugins/smokeybot/parser';
import { format_number, getCurrentTime, getRndInteger } from '../utils';
import { getCache, getGCD, ICache } from './cache';
import { getGuildSettings, IGuildSettings } from './database';
import { getLogger } from './logger';

const logger = getLogger('DiscordClient');
export let rateLimited = false;
export let initializing = true;

export const discordClient = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
  ],
  shards: 'auto',
});

discordClient.on('ready', async () => {
  logger.info(`Total MonsterPool: ${getAllMonsters().length}.`);
  logger.info(`Total Monsters: ${MonsterDex.size}.`);
  logger.info('Fully initialized.');
  initializing = false;
});

discordClient.on('rateLimit', (error) => {
  const timeoutStr = error.timeout / 1000;
  logger.warn(
    `Rate Limited.. waiting ${format_number(
      Math.round(timeoutStr / 60),
    )} minutes.`,
  );

  rateLimited = true;

  setTimeout(() => {
    logger.warn('Rate limit timeout elapsed.');
    rateLimited = false;
  }, error.timeout);
});

discordClient.on('shardError', (error) => {
  console.error('A websocket connection encountered an error:', error);
});

discordClient.on('error', (error) => {
  console.error('Discord Client Error:', error);
});

discordClient.on('shardReady', (id: number) => {
  console.error(`Shard ${id} is ready.`);
});

discordClient.on('messageCreate', async (message) => {
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
    rateLimited ||
    message.author.bot
  ) {
    return;
  }

  const settings: IGuildSettings = await getGuildSettings(message);

  const cache: ICache = await getCache(message, settings);

  const GCD: number = await getGCD(message.guild.id);

  if (cache && settings) {
    if (timestamp - GCD > 5) {
      await smokeybotParser(message, cache);
    }

    if (cache.settings.smokemon_enabled) {
      let spawn = await MONSTER_SPAWNS.get(message.guild.id);

      if (!spawn) {
        spawn = {
          monster: undefined,
          spawned_at: getCurrentTime() - 30,
        };
        MONSTER_SPAWNS.set(message.guild.id, spawn);
        await monsterParser(message, cache);
      } else {
        const spawn_timer = getRndInteger(getRndInteger(15, 120), 300);

        if (
          timestamp - spawn.spawned_at > spawn_timer &&
          !message.content.match(/catch/i) &&
          !message.content.match(/spawn/i) &&
          !rateLimited &&
          !initializing
        ) {
          await spawnMonster(message, cache);
        }

        await monsterParser(message, cache);
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
