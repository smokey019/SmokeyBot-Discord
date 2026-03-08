
import { CommandInteraction, Guild } from 'discord.js';
import knex, { Knex } from 'knex';
import { MonsterUserTable, type IMonsterUserModel } from '../../models/MonsterUser';
import { getLogger } from '../logger';

const logger = getLogger('Database');

// Environment variable validation
const requiredEnvVars = [
  'DB_DATABASE',
  'DB_HOST',
  'DB_PORT',
  'DB_PASSWORD',
  'DB_USER'
] as const;

function validateEnvironmentVariables(): void {
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const port = parseInt(process.env.DB_PORT || '3306');
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error('DB_PORT must be a valid port number between 1 and 65535');
  }
}

// Validate environment on module load
validateEnvironmentVariables();

// Database connection state management
interface DatabaseState {
  isConnected: boolean;
  reconnectAttempts: number;
  lastHealthCheck: number;
  connectionErrors: number;
}

const dbState: DatabaseState = {
  isConnected: false,
  reconnectAttempts: 0,
  lastHealthCheck: 0,
  connectionErrors: 0,
};

// Reconnection configuration
const RECONNECT_CONFIG = {
  maxAttempts: 10,
  baseDelay: 1000,
  maxDelay: 30000,
  healthCheckInterval: 60000,
  queryTimeout: 15000,
  slowQueryThreshold: 5000, // 5 seconds
  retryDelayMultiplier: 1000, // 1 second per attempt
  globalSettingsCacheTTL: 300000, // 5 minutes
  poolWarningThreshold: 0.8, // Warn at 80% pool usage
};

let databaseClient: Knex;
let reconnectTimer: Timer | null = null;
let healthCheckTimer: Timer | null = null;
let isReconnecting = false; // Guard to prevent concurrent reconnections

// Global settings cache with LRU eviction
interface CachedSetting {
  value: any;
  timestamp: number;
}
const globalSettingsCache = new Map<GlobalSettingKey, CachedSetting>();

// Guild settings cache with LRU to prevent unbounded growth
const MAX_GUILD_SETTINGS_CACHE = 200; // Limit to 200 most recent guilds
const guildSettingsCache = new Map<string, { settings: IGuildSettings, timestamp: number }>();

// LRU helper for guild settings cache
function evictOldestGuildSetting(): void {
  if (guildSettingsCache.size >= MAX_GUILD_SETTINGS_CACHE) {
    // Find oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of guildSettingsCache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      guildSettingsCache.delete(oldestKey);
      logger.debug(`Evicted oldest guild settings from cache: ${oldestKey}`);
    }
  }
}

// Enhanced connection configuration with reconnection support
const createKnexConfig = () => ({
  client: 'mysql2',
  connection: {
    database: process.env.DB_DATABASE!,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    password: process.env.DB_PASSWORD!,
    user: process.env.DB_USER!,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 300000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    propagateCreateError: false,
    afterCreate: (conn: any, done: Function) => {
      conn.query('SET sql_mode="TRADITIONAL"', (err: any) => {
        if (err) logger.warn('Failed to set SQL mode:', err);
        done(err, conn);
      });
    },
  },
  acquireConnectionTimeout: 30000,
  log: {
    warn(message: string) {
      logger.warn(message);
    },
    error(message: string) {
      logger.error(message);
      dbState.connectionErrors++;
    },
    deprecate(message: string) {
      logger.warn(`DEPRECATED: ${message}`);
    },
    debug(message: string) {
      if (process.env.DB_DEBUG === 'true') logger.debug(message);
    },
  },
});

// Initialize database connection with retry logic
async function initializeDatabaseConnection(): Promise<Knex> {
  try {
    if (databaseClient) {
      await databaseClient.destroy();
    }

    databaseClient = knex(createKnexConfig());

    // Test initial connection
    await databaseClient.raw('SELECT 1 as test');

    dbState.isConnected = true;
    dbState.reconnectAttempts = 0;
    dbState.connectionErrors = 0;

    logger.info('✅ Database connection established');
    startHealthCheckTimer();

    return databaseClient;
  } catch (error) {
    logger.error('❌ Failed to initialize database connection:', error);
    dbState.isConnected = false;
    throw error;
  }
}

// Exponential backoff calculation
function calculateBackoffDelay(attempt: number): number {
  const delay = Math.min(
    RECONNECT_CONFIG.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
    RECONNECT_CONFIG.maxDelay
  );
  return Math.floor(delay);
}

// Automatic reconnection with exponential backoff
async function attemptReconnection(): Promise<void> {
  // Prevent concurrent reconnection attempts
  if (isReconnecting) {
    logger.debug('Reconnection already in progress, skipping duplicate attempt');
    return;
  }

  if (dbState.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    logger.error(`❌ Maximum reconnection attempts (${RECONNECT_CONFIG.maxAttempts}) exceeded`);
    isReconnecting = false;
    return;
  }

  isReconnecting = true;
  dbState.reconnectAttempts++;
  const delay = calculateBackoffDelay(dbState.reconnectAttempts - 1);

  logger.warn(`🔄 Attempting database reconnection (${dbState.reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts}) in ${delay}ms`);

  if (reconnectTimer) clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(async () => {
    try {
      await initializeDatabaseConnection();
      logger.info('✅ Database reconnection successful');
      isReconnecting = false;
    } catch (error) {
      logger.error(`❌ Reconnection attempt ${dbState.reconnectAttempts} failed:`, error);

      if (dbState.reconnectAttempts < RECONNECT_CONFIG.maxAttempts) {
        isReconnecting = false;
        await attemptReconnection();
      } else {
        isReconnecting = false;
      }
    }
  }, delay);
}

// Health check function - bypasses executeQuery to avoid the isConnected guard
async function performHealthCheck(): Promise<boolean> {
  try {
    const startTime = Date.now();
    await databaseClient.raw('SELECT 1 as health_check');
    const responseTime = Date.now() - startTime;

    if (responseTime > RECONNECT_CONFIG.slowQueryThreshold) {
      logger.warn(`⚠️ Slow database response: ${responseTime}ms`);
    }

    if (!dbState.isConnected) {
      dbState.isConnected = true;
      dbState.reconnectAttempts = 0;
      logger.info('✅ Database connection restored');
    }

    dbState.lastHealthCheck = Date.now();

    // Check connection pool health
    checkPoolHealth();

    return true;
  } catch (error) {
    logger.error('❌ Database health check failed:', error);
    dbState.isConnected = false;
    // Reset attempts so periodic health checks always get fresh reconnection tries
    dbState.reconnectAttempts = 0;
    logger.warn('🔌 Database connection lost, attempting reconnection...');
    await attemptReconnection();

    return false;
  }
}

// Check connection pool health
function checkPoolHealth(): void {
  try {
    const pool = (databaseClient.client as any).pool;
    if (pool) {
      const numUsed = pool.numUsed?.() || 0;
      const numFree = pool.numFree?.() || 0;
      const numPendingAcquires = pool.numPendingAcquires?.() || 0;
      const numPendingCreates = pool.numPendingCreates?.() || 0;

      const total = numUsed + numFree;
      const usagePercent = total > 0 ? numUsed / total : 0;

      if (usagePercent > RECONNECT_CONFIG.poolWarningThreshold) {
        logger.warn(
          `⚠️ High connection pool usage: ${(usagePercent * 100).toFixed(1)}% ` +
          `(${numUsed}/${total} in use, ${numPendingAcquires} pending)`
        );
      }

      if (numPendingAcquires > 5) {
        logger.warn(`⚠️ ${numPendingAcquires} connections waiting for pool`);
      }
    }
  } catch (error) {
    // Pool introspection might not be available in all versions, fail silently
    logger.debug('Could not check pool health:', error);
  }
}

// Start periodic health checks
function startHealthCheckTimer(): void {
  if (healthCheckTimer) clearInterval(healthCheckTimer);

  healthCheckTimer = setInterval(async () => {
    await performHealthCheck();
  }, RECONNECT_CONFIG.healthCheckInterval);
}

// Enhanced query wrapper with automatic retry
async function executeQuery<T = any>(
  operation: () => Promise<T>,
  retryCount: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      if (!dbState.isConnected) {
        throw new Error('Database not connected');
      }

      let timeoutHandle: Timer;
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('Query timeout')), RECONNECT_CONFIG.queryTimeout);
        })
      ]);
      clearTimeout(timeoutHandle!);

      return result;
    } catch (error: any) {
      const isConnectionError = error.code === 'PROTOCOL_CONNECTION_LOST' ||
                               error.code === 'ECONNRESET' ||
                               error.code === 'ETIMEDOUT' ||
                               error.message?.includes('Connection lost') ||
                               error.message?.includes('Database not connected');

      if (isConnectionError && attempt < retryCount) {
        logger.warn(`🔄 Connection error, retrying query (attempt ${attempt}/${retryCount})`);

        if (dbState.isConnected) {
          dbState.isConnected = false;
          attemptReconnection();
        }

        await new Promise(resolve => setTimeout(resolve, RECONNECT_CONFIG.retryDelayMultiplier * attempt));
        continue;
      }

      throw error;
    }
  }

  throw new Error('All query retry attempts failed');
}

// Initialize database connection immediately
initializeDatabaseConnection().catch(error => {
  logger.error('💥 Critical: Failed to initialize database connection:', error);
  process.exit(1);
});

export { databaseClient };

// Global settings type for better type safety
type GlobalSettingKey =
  | 'pokemon_user_boost'
  | 'pokemon_pool_size'
  | 'global_cooldown'
  | 'personal_cooldown'
  | 'pokemon_spawn_time_min'
  | 'pokemon_spawn_time_max'
  | 'shiny_odds_retail'
  | 'shiny_odds_smokemon'
  | 'perfect_iv_odds';

interface GlobalSettings {
  [key: string]: any;
  pokemon_user_boost?: number;
  pokemon_pool_size?: number;
  global_cooldown?: number;
  personal_cooldown?: number;
  pokemon_spawn_time_min?: number;
  pokemon_spawn_time_max?: number;
  shiny_odds_retail?: number;
  shiny_odds_smokemon?: number;
  perfect_iv_odds?: number;
}

/**
 * Load setting from database with error handling, validation, and caching
 * @param which - The setting key to retrieve
 * @param bypassCache - If true, skip cache and fetch fresh from database
 * @returns Promise resolving to the setting value
 * @throws Error if setting key is invalid or database query fails
 */
export async function loadGlobalSetting(which: GlobalSettingKey, bypassCache = false): Promise<any> {
  try {
    // Check cache first (unless bypassed)
    if (!bypassCache) {
      const cached = globalSettingsCache.get(which);
      if (cached && (Date.now() - cached.timestamp) < RECONNECT_CONFIG.globalSettingsCacheTTL) {
        logger.debug(`Using cached global setting: ${which}`);
        return cached.value;
      }
    }

    // Fetch from database
    const settings = await executeQuery(() =>
      databaseClient<GlobalSettings>('global_smokeybot_settings').first()
    );

    if (!settings) {
      throw new Error('No global settings found in database');
    }

    if (!(which in settings)) {
      throw new Error(`Setting key '${which}' not found in global settings`);
    }

    const value = settings[which];

    // Cache the result
    globalSettingsCache.set(which, {
      value,
      timestamp: Date.now(),
    });

    return value;
  } catch (error) {
    logger.error(`Failed to load global setting '${which}':`, error);
    throw error;
  }
}

/**
 * Clear the global settings cache (useful after updating settings)
 */
export function clearGlobalSettingsCache(): void {
  globalSettingsCache.clear();
  logger.debug('Global settings cache cleared');
}

export const GuildSettingsTable = 'guild_settings';

export interface IGuildSettings {
  id: number;
  guild_id: string;
  smokemon_enabled: number;
  specific_channel?: string;
  announcements_enabled: number;
  prefixes?: string;
}

/**
 * Shared function to create guild settings
 * @param guildId - Guild ID
 * @param guildName - Guild name for logging
 * @returns Promise resolving to the created guild settings
 */
async function createGuildSettings(guildId: string, guildName: string): Promise<IGuildSettings | undefined> {
  try {
    if (!guildId) {
      throw new Error('Guild ID cannot be empty');
    }

    logger.info(`Creating new settings for guild ${guildName} (${guildId})`);

    // Use returning() to get the created row in one query (MySQL 8.0.1+)
    // For older MySQL, falls back to insert + select
    const [createdSettings] = await executeQuery(async () => {
      const insertResult = await databaseClient<IGuildSettings>(GuildSettingsTable)
        .insert({
          guild_id: guildId,
          smokemon_enabled: 0,
          announcements_enabled: 0,
        });

      // Fetch the newly created settings using the insert ID
      if (insertResult && insertResult.length > 0) {
        return databaseClient<IGuildSettings>(GuildSettingsTable)
          .select()
          .where('id', insertResult[0])
          .first()
          .then(result => [result]);
      }
      return [undefined];
    });

    if (createdSettings) {
      logger.info(`Created new guild settings for ${guildName} (${guildId})`);
      return createdSettings;
    } else {
      logger.error(`Failed to create guild settings for ${guildName} (${guildId})`);
      return undefined;
    }
  } catch (error) {
    logger.error(`Error creating guild settings for ${guildName} (${guildId}):`, error);
    throw error;
  }
}

/**
 * Retrieves guild settings from database, creating new settings if they don't exist
 * Now with LRU caching to prevent unbounded memory growth with 1000+ guilds
 * @param guild - Discord Guild object
 * @returns Promise resolving to guild settings or undefined if creation fails
 */
export async function getGuildSettings(guild: Guild): Promise<IGuildSettings | undefined> {
  try {
    // Check cache first
    const cached = guildSettingsCache.get(guild.id);
    if (cached && (Date.now() - cached.timestamp) < RECONNECT_CONFIG.globalSettingsCacheTTL) {
      return cached.settings;
    }

    let guildSettings = await executeQuery(() =>
      databaseClient<IGuildSettings>(GuildSettingsTable)
        .select()
        .where('guild_id', guild.id)
        .first()
    );

    if (!guildSettings) {
      guildSettings = await createGuildSettings(guild.id, guild.name);
    }

    // Cache the result with LRU eviction
    if (guildSettings) {
      evictOldestGuildSetting(); // Evict before adding new entry
      guildSettingsCache.set(guild.id, {
        settings: guildSettings,
        timestamp: Date.now(),
      });
    }

    return guildSettings;
  } catch (error) {
    logger.error(`Error getting guild settings for ${guild.name} (${guild.id}):`, error);
    return undefined;
  }
}

/**
 * Get the total count of users in the database
 * @returns Promise resolving to string representation of user count
 */
export async function getUserDBCount(): Promise<string> {
  try {
    const result = await executeQuery(() =>
      databaseClient<IMonsterUserModel>(MonsterUserTable)
        .count('* as count')
        .first()
    );

    const count = result?.count || 0;
    return count.toString();
  } catch (error) {
    logger.error('Failed to get user database count:', error);
    throw error;
  }
}

/**
 * Retrieve user data from database by user ID
 * @param uid - User ID (number or string)
 * @returns Promise resolving to user model or undefined if not found
 */
export async function getUser(uid: number | string): Promise<IMonsterUserModel | undefined> {
  try {
    const userSettings = await executeQuery(() =>
      databaseClient<IMonsterUserModel>(MonsterUserTable)
        .select()
        .where('uid', uid)
        .first()
    );

    return userSettings;
  } catch (error) {
    logger.error(`Failed to get user with ID ${uid}:`, error);
    throw error;
  }
}

/**
 * Creates new guild settings in database for the specified interaction's guild
 * @param interaction - Discord CommandInteraction object
 * @returns Promise resolving to the ID of the created record
 * @throws Error if guild is null or database insertion fails
 */
export async function putGuildSettings(interaction: CommandInteraction): Promise<number> {
  if (!interaction.guild) {
    throw new Error('Cannot create guild settings: interaction.guild is null');
  }

  try {
    const createdSettings = await createGuildSettings(interaction.guild.id, interaction.guild.name);

    if (!createdSettings || !createdSettings.id) {
      throw new Error('Database insertion returned no results');
    }

    return createdSettings.id;
  } catch (error) {
    logger.error(`Failed to create guild settings for ${interaction.guild.name} (${interaction.guild.id}):`, error);
    throw error;
  }
}

/**
 * Test database connection
 * @returns Promise resolving to true if connection is successful
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await executeQuery(() => databaseClient.raw('SELECT 1'));
    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Gracefully close database connection
 * @returns Promise that resolves when connection is closed
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);

    await databaseClient.destroy();
    dbState.isConnected = false;
    logger.info('Database connection closed successfully');
  } catch (error) {
    logger.error('Error closing database connection:', error);
    throw error;
  }
}

/**
 * Get database connection statistics
 */
export function getDatabaseStats() {
  return {
    isConnected: dbState.isConnected,
    reconnectAttempts: dbState.reconnectAttempts,
    lastHealthCheck: dbState.lastHealthCheck,
    connectionErrors: dbState.connectionErrors,
    timeSinceLastCheck: Date.now() - dbState.lastHealthCheck,
    isReconnecting,
    cacheSize: globalSettingsCache.size,
  };
}

/**
 * Get connection pool statistics
 */
export function getPoolStats() {
  try {
    const pool = (databaseClient.client as any).pool;
    if (pool) {
      return {
        numUsed: pool.numUsed?.() || 0,
        numFree: pool.numFree?.() || 0,
        numPendingAcquires: pool.numPendingAcquires?.() || 0,
        numPendingCreates: pool.numPendingCreates?.() || 0,
        min: pool.min || 0,
        max: pool.max || 0,
      };
    }
    return null;
  } catch (error) {
    logger.debug('Could not get pool stats:', error);
    return null;
  }
}

/**
 * Dispose of all resources and timers to prevent memory leaks
 * Call this when shutting down the database module
 */
export function disposeDatabase(): void {
  // Clear timers
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Clear caches
  globalSettingsCache.clear();
  guildSettingsCache.clear();

  // Reset state
  isReconnecting = false;

  logger.info('✅ Database module disposed');
}