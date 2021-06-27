import { Collection, Message } from 'discord.js';
import Keyv from 'keyv';
import { getCurrentTime } from '../utils';
import { IGuildSettings } from './database';
import { getLogger } from './logger';

const logger = getLogger('Cache');

export const caches: Collection<string, Keyv> = new Collection();

const defaultCache = '$default';

/**
 * Spawn/load a cache.
 * @param category Cache name.
 * @param ttl TTL in seconds.
 * @returns Keyv
 */
export function loadCache(category = defaultCache, ttl = 0): Keyv {
  if (!caches.has(category)) {
    const newCache = new Keyv({
      namespace: category,
      ttl: ttl * 1000,
    });
    caches.set(category, newCache);
    return caches.get(category);
  } else {
    return caches.get(category);
  }
}

/**
 * Clear a particular cache or `all`.
 * @param category Cache name. Use `all` for clearing all caches.
 * @returns boolean
 */
export async function clearCache(category = defaultCache): Promise<boolean> {
  if (category == 'all') {
    caches.clear();
    return true;
  } else {
    if (caches.delete(category)) {
      return true;
    } else {
      return false;
    }
  }
}

export interface ICache {
  tweet: undefined | any;
  settings: {
    id: number;
    guild_id: number | string;
    smokemon_enabled: number;
    specific_channel: string;
  };
}

export const cacheClient = loadCache('cacheClient');
export const xp_cache = loadCache('xp_cache');
export const cacheTwitter = loadCache('cacheTwitter');
export const cacheTweets = loadCache('cacheTweets');
export const cacheToBeDeleted = loadCache('cacheToBeDeleted');
export const GLOBAL_COOLDOWN = loadCache('GLOBAL_COOLDOWN');
export const MONSTER_CACHE = loadCache('MONSTER_CACHE', 10);
export const SMOKEYBOT_GLOBAL_SETTINGS_CACHE = loadCache('SMOKEYBOT_GLOBAL_SETTINGS_CACHE', 10);
export const CACHE_POKEDEX = loadCache('CACHE_POKEDEX', 180);

cacheClient.on('error', (error) => logger.error(error));

export async function getGCD(guild_id: string): Promise<number> {
  const GCD = await GLOBAL_COOLDOWN.get(guild_id);
  const timestamp = getCurrentTime();

  if (!GCD) {
    await GLOBAL_COOLDOWN.set(guild_id, timestamp - 15);
    return timestamp - 15;
  } else {
    return GCD;
  }
}

export async function getCache(
  message: Message,
  settings: IGuildSettings,
): Promise<ICache> {
  if (!settings) return undefined;

  let cache = await cacheClient.get(message.guild.id);

  if (!cache) {
    cache = {
      tweet: [],
      settings: {
        id: settings.id,
        guild_id: settings.guild_id,
        smokemon_enabled: settings.smokemon_enabled,
        specific_channel: settings.specific_channel,
      },
    };
    await cacheClient.set(message.guild.id, cache);
    await cacheTwitter.set(message.guild.id, 'summit1g');
    return cache;
  } else {
    return cache;
  }
}
