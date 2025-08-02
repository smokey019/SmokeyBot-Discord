import { Collection, CommandInteraction, Guild } from 'discord.js';
import { getCurrentTime } from '../../utils';
import type { IGuildSettings } from '../database';

// Node for doubly-linked list used in LRU tracking
class LRUNode<K> {
  key: K;
  prev: LRUNode<K> | null = null;
  next: LRUNode<K> | null = null;

  constructor(key: K) {
    this.key = key;
  }
}

// Custom LRU Cache implementation with TTL support and optimized LRU operations
class CustomLRUCache<K, V> {
  private readonly maxSize: number;
  private readonly ttl: number; // Time to live in milliseconds
  private cache = new Map<K, { value: V; timestamp: number; accessTime: number; node: LRUNode<K> }>();
  private head: LRUNode<K> | null = null;
  private tail: LRUNode<K> | null = null;
  private hits = 0;
  private misses = 0;
  private estimatedMemoryUsage = 0;

  constructor(maxSize: number = 100, ttlSeconds: number = 0) {
    this.maxSize = maxSize;
    this.ttl = ttlSeconds * 1000; // Convert to milliseconds
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if entry has expired
    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access time and move to head (most recently used)
    entry.accessTime = Date.now();
    this.moveToHead(entry.node);
    this.hits++;

    return entry.value;
  }

  set(key: K, value: V): void {
    const now = Date.now();

    if (this.cache.has(key)) {
      // Update existing entry
      const entry = this.cache.get(key)!;
      const oldSize = this.estimateSize(entry.value);
      entry.value = value;
      entry.timestamp = now;
      entry.accessTime = now;
      this.moveToHead(entry.node);
      this.estimatedMemoryUsage += this.estimateSize(value) - oldSize;
    } else {
      // Add new entry
      if (this.cache.size >= this.maxSize) {
        this.evictLeastRecentlyUsed();
      }

      const node = new LRUNode(key);
      this.cache.set(key, { value, timestamp: now, accessTime: now, node });
      this.addToHead(node);
      this.estimatedMemoryUsage += this.estimateSize(key) + this.estimateSize(value);
    }
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.removeNode(entry.node);
    this.estimatedMemoryUsage -= this.estimateSize(key) + this.estimateSize(entry.value);
    this.cache.delete(key);

    return true;
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
    this.estimatedMemoryUsage = 0;
  }

  get size(): number {
    this.cleanupExpired();
    return this.cache.size;
  }

  keys(): K[] {
    this.cleanupExpired();
    return Array.from(this.cache.keys());
  }

  // Get keys in LRU order (least recently used first)
  keysInLRUOrder(): K[] {
    this.cleanupExpired();
    const keys: K[] = [];
    let current = this.tail;
    while (current) {
      keys.push(current.key);
      current = current.prev;
    }
    return keys;
  }

  values(): V[] {
    this.cleanupExpired();
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  entries(): Array<[K, V]> {
    this.cleanupExpired();
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  // Get cache statistics with hit/miss ratios and memory usage
  getStats(): { 
    size: number; 
    maxSize: number; 
    hitRate: number;
    missRate: number;
    totalRequests: number;
    estimatedMemoryUsage: number;
  } {
    this.cleanupExpired();
    const totalRequests = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.misses / totalRequests : 0,
      totalRequests,
      estimatedMemoryUsage: this.estimatedMemoryUsage,
    };
  }

  // Doubly-linked list operations for O(1) LRU management
  private addToHead(node: LRUNode<K>): void {
    if (!this.head) {
      this.head = this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }
  }

  private removeNode(node: LRUNode<K>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = node.next = null;
  }

  private moveToHead(node: LRUNode<K>): void {
    if (node === this.head) return;
    
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictLeastRecentlyUsed(): void {
    if (!this.tail) return;

    const lruKey = this.tail.key;
    const entry = this.cache.get(lruKey);
    if (entry) {
      this.estimatedMemoryUsage -= this.estimateSize(lruKey) + this.estimateSize(entry.value);
    }
    this.removeNode(this.tail);
    this.cache.delete(lruKey);
  }

  // Simple memory estimation for basic types
  private estimateSize(value: any): number {
    if (value === null || value === undefined) return 8;
    if (typeof value === 'string') return value.length * 2 + 24;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value).length * 2 + 24;
      } catch {
        return 100; // Fallback estimate
      }
    }
    return 50; // Default estimate
  }

  private cleanupExpired(): void {
    if (this.ttl <= 0) return;

    const now = Date.now();
    const expiredKeys: K[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.delete(key));
  }
}

// Cache configuration interface
interface CacheConfig {
  maxSize?: number;
  ttlSeconds?: number;
}

// Default cache configurations
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 100,
  ttlSeconds: 0, // No expiration by default
};

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  cacheClient: { maxSize: 50, ttlSeconds: 3600 }, // 1 hour TTL
  xp_cache: { maxSize: 500, ttlSeconds: 900 }, // 15 minutes TTL
  GLOBAL_COOLDOWN: { maxSize: 1000, ttlSeconds: 300 }, // 5 minutes TTL
  GLOBAL_SETTINGS_CACHE: { maxSize: 100, ttlSeconds: 1800 }, // 30 minutes TTL
};

// Batch operations interface
export interface BatchOperation<K, V> {
  type: 'get' | 'set' | 'delete';
  key: K;
  value?: V;
}

export interface BatchResult<K, V> {
  key: K;
  value?: V;
  success: boolean;
  error?: string;
}

// Cache registry
export const caches: Collection<string, CustomLRUCache<string, any>> = new Collection();

const DEFAULT_CACHE = '$default';

// Initialize predefined caches with optimized configurations
export const cacheClient = loadCache('cacheClient');
export const xp_cache = loadCache('xp_cache');
export const GLOBAL_COOLDOWN = loadCache('GLOBAL_COOLDOWN');
export const SMOKEYBOT_GLOBAL_SETTINGS_CACHE = loadCache('GLOBAL_SETTINGS_CACHE');

/**
 * Create or retrieve a cache instance with optimized configuration
 * @param category - Cache name/category
 * @param config - Optional cache configuration (overrides defaults)
 * @returns CustomLRUCache instance
 */
export function loadCache(
  category: string = DEFAULT_CACHE,
  config?: CacheConfig
): CustomLRUCache<string, any> {
  if (caches.has(category)) {
    return caches.get(category)!;
  }

  // Use predefined config or provided config or default
  const finalConfig = config || CACHE_CONFIGS[category] || DEFAULT_CACHE_CONFIG;

  const newCache = new CustomLRUCache<string, any>(
    finalConfig.maxSize,
    finalConfig.ttlSeconds
  );

  caches.set(category, newCache);
  return newCache;
}

/**
 * Perform batch operations on a cache for better performance
 * @param category - Cache name
 * @param operations - Array of batch operations
 * @returns Array of results
 */
export function batchCacheOperations<K extends string, V>(
  category: string,
  operations: BatchOperation<K, V>[]
): BatchResult<K, V>[] {
  const cache = loadCache(category);
  const results: BatchResult<K, V>[] = [];

  for (const operation of operations) {
    try {
      switch (operation.type) {
        case 'get':
          const value = cache.get(operation.key);
          results.push({ key: operation.key, value, success: true });
          break;
        case 'set':
          if (operation.value !== undefined) {
            cache.set(operation.key, operation.value);
            results.push({ key: operation.key, success: true });
          } else {
            results.push({ key: operation.key, success: false, error: 'Value required for set operation' });
          }
          break;
        case 'delete':
          const deleted = cache.delete(operation.key);
          results.push({ key: operation.key, success: deleted });
          break;
        default:
          results.push({ key: operation.key, success: false, error: 'Unknown operation type' });
      }
    } catch (error) {
      results.push({ key: operation.key, success: false, error: String(error) });
    }
  }

  return results;
}

/**
 * Generate comprehensive cache report for monitoring
 * @param interaction - Discord command interaction
 */
export async function reportCache(interaction: CommandInteraction): Promise<void> {
  const report: string[] = ['📊 **Cache Health Report**\n'];

  let totalEntries = 0;
  let totalMaxSize = 0;

  for (const [key, cache] of caches) {
    const stats = cache.getStats();
    const utilizationPercent = Math.round((stats.size / stats.maxSize) * 100);
    const hitRatePercent = Math.round(stats.hitRate * 100);
    const memoryMB = Math.round(stats.estimatedMemoryUsage / (1024 * 1024) * 100) / 100;

    totalEntries += stats.size;
    totalMaxSize += stats.maxSize;

    const utilizationEmoji = utilizationPercent > 80 ? '🔴' : utilizationPercent > 50 ? '🟡' : '🟢';
    const hitRateEmoji = hitRatePercent > 80 ? '🟢' : hitRatePercent > 50 ? '🟡' : '🔴';

    report.push(
      `${utilizationEmoji} **${key}**: ${stats.size}/${stats.maxSize} (${utilizationPercent}%) | Hit Rate: ${hitRateEmoji}${hitRatePercent}% | Memory: ${memoryMB}MB`
    );
  }

  const overallUtilization = Math.round((totalEntries / totalMaxSize) * 100);
  report.push('');
  report.push(`**Overall**: ${totalEntries}/${totalMaxSize} entries (${overallUtilization}%)`);

  const content = report.join('\n');

  if (content.length > 2000) {
    // Split long messages
    const chunks = content.match(/.{1,1900}/g) || [];
    await interaction.reply(chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(chunks[i]);
    }
  } else {
    await interaction.reply(content);
  }
}

/**
 * Clear specific cache or all caches with confirmation
 * @param category - Cache name or 'all' for all caches
 * @returns Success status
 */
export async function clearCache(category: string = DEFAULT_CACHE): Promise<boolean> {
  try {
    if (category === 'all') {
      let clearedCount = 0;
      caches.forEach((cache) => {
        const sizeBefore = cache.size;
        cache.clear();
        if (sizeBefore > 0) clearedCount++;
      });
      return clearedCount > 0;
    }

    const cache = caches.get(category);
    if (!cache) {
      return false;
    }

    const sizeBefore = cache.size;
    cache.clear();
    return sizeBefore > 0;
  } catch (error) {
    console.error(`Failed to clear cache ${category}:`, error);
    return false;
  }
}

/**
 * cache interface with better type safety
 */
export interface ICache {
  tweet: any[];
  settings: {
    id: number;
    guild_id: string | number;
    smokemon_enabled: number;
    specific_channel: string;
  };
  metadata?: {
    lastUpdated: number;
    version: string;
  };
}

/**
 * Get or initialize Global Cooldown with better error handling
 * @param guild_id - Guild identifier
 * @returns Cooldown timestamp
 */
export async function getGCD(guild_id: string): Promise<number> {
  try {
    const existingGCD = GLOBAL_COOLDOWN.get(guild_id);
    const currentTime = getCurrentTime();

    if (existingGCD === undefined) {
      const initialCooldown = currentTime - 15;
      GLOBAL_COOLDOWN.set(guild_id, initialCooldown);
      return initialCooldown;
    }

    return existingGCD;
  } catch (error) {
    console.error(`Failed to get GCD for guild ${guild_id}:`, error);
    return getCurrentTime() - 15; // Fallback
  }
}

/**
 * cache retrieval with better type safety and error handling
 * @param guild - Discord guild object
 * @param settings - Guild settings from database
 * @returns Cached guild data
 */
export async function getCache(
  guild: Guild,
  settings: IGuildSettings,
): Promise<ICache> {
  try {
    const existingCache = cacheClient.get(guild.id);

    if (!existingCache) {
      const newCache: ICache = {
        tweet: [],
        settings: {
          id: settings.id,
          guild_id: settings.guild_id,
          smokemon_enabled: settings.smokemon_enabled,
          specific_channel: settings.specific_channel,
        },
        metadata: {
          lastUpdated: Date.now(),
          version: '2.0',
        },
      };

      cacheClient.set(guild.id, newCache);
      return newCache;
    }

    // Ensure metadata exists for backwards compatibility
    if (!existingCache.metadata) {
      existingCache.metadata = {
        lastUpdated: Date.now(),
        version: '2.0',
      };
      cacheClient.set(guild.id, existingCache);
    }

    return existingCache;
  } catch (error) {
    console.error(`Failed to get cache for guild ${guild.id}:`, error);

    // Return minimal safe cache on error
    return {
      tweet: [],
      settings: {
        id: settings.id,
        guild_id: settings.guild_id,
        smokemon_enabled: settings.smokemon_enabled,
        specific_channel: settings.specific_channel,
      },
      metadata: {
        lastUpdated: Date.now(),
        version: '2.0',
      },
    };
  }
}

/**
 * Utility function to get cache utilization statistics
 * @returns Object with cache statistics
 */
export function getCacheStats(): Record<string, any> {
  const stats: Record<string, any> = {};

  for (const [name, cache] of caches) {
    stats[name] = cache.getStats();
  }

  return stats;
}

/**
 * Preload frequently accessed cache entries
 * @param guildIds - Array of guild IDs to preload
 */
export async function preloadCache(guildIds: string[]): Promise<void> {
  // Implementation would depend on your data source
  // This is a placeholder for preloading logic
  console.log(`Preloading cache for ${guildIds.length} guilds`);
}

/**
 * Background cleanup task to remove expired entries
 * Call this periodically (e.g., every 5 minutes)
 */
export function cleanupExpiredEntries(): void {
  for (const [name, cache] of caches) {
    // The cleanup happens automatically when accessing entries,
    // but we can force it by calling getStats()
    cache.getStats();
  }
}