/* eslint-disable @typescript-eslint/no-explicit-any */
import { Collection, Guild } from 'discord.js';
import { LRUCache } from 'mnemonist';
import { getCurrentTime } from '../utils';
import { IGuildSettings } from './database';

export const caches: Collection<
  string,
  LRUCache<string, any>
> = new Collection();

const defaultCache = '$default';

export const cacheClient = loadCache('cacheClient', 100);
export const xp_cache = loadCache('xp_cache', 50);
export const cacheTwitter = loadCache('cacheTwitter', 15);
export const cacheTweets = loadCache('cacheTweets', 15);
export const cacheToBeDeleted = loadCache('cacheToBeDeleted', 15);
export const GLOBAL_COOLDOWN = loadCache('GLOBAL_COOLDOWN', 15);
export const SMOKEYBOT_GLOBAL_SETTINGS_CACHE = loadCache(
  'GLOBAL_SETTINGS_CACHE',
);

/**
 * Spawn/load a cache.
 * @param category Cache name.
 * @returns Lru
 */
export function loadCache(
  category = defaultCache,
  maximum = 100,
): LRUCache<string, any> {
  if (!caches.has(category)) {
    const newCache = new LRUCache<string, any>(maximum);
    caches.set(category, newCache);
    return newCache;
  } else {
    return caches.get(category) as LRUCache<string, any>;
  }
}

export async function reportCache(interaction: Interaction): Promise<void> {
  const report = [];

  report.push('Cache Reports:\n');

  for (const [key, value] of caches) {
    report.push(`**${key}** has **${value.size}** entries.`);
  }

  await (interaction as BaseCommandInteraction).reply(report.join('\n'));
}

/**
 * Clear a particular cache or `all`.
 * @param category Cache name. Use `all` for clearing all caches.
 * @returns boolean
 */
export async function clearCache(category = defaultCache): Promise<boolean> {
  if (category == 'all') {
    caches.forEach((element) => {
      element.clear();
    });
    return true;
  } else {
    if (caches.has(category)) {
      caches.get(category)?.clear();
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

/**
 * Retrieve cached GCD if available.
 * @param guild_id
 * @returns
 */
export async function getGCD(guild_id: string): Promise<number> {
  const GCD = await GLOBAL_COOLDOWN?.get(guild_id);
  const timestamp = getCurrentTime();

  if (!GCD) {
    await GLOBAL_COOLDOWN?.set(guild_id, timestamp - 15);
    return timestamp - 15;
  } else {
    return GCD;
  }
}

export async function getCache(
  guild: Guild,
  settings: IGuildSettings,
): Promise<ICache> {
  let cache = await cacheClient?.get(guild.id);

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
    cacheClient?.set(guild.id, cache);
    cacheTwitter?.set(guild.id, 'summit1g');
    return cache;
  } else {
    return cache;
  }
}
