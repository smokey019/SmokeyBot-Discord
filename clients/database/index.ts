
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
};

let databaseClient: Knex;
let reconnectTimer: Timer | null = null;
let healthCheckTimer: Timer | null = null;

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
  if (dbState.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    logger.error(`❌ Maximum reconnection attempts (${RECONNECT_CONFIG.maxAttempts}) exceeded`);
    return;
  }

  dbState.reconnectAttempts++;
  const delay = calculateBackoffDelay(dbState.reconnectAttempts - 1);

  logger.warn(`🔄 Attempting database reconnection (${dbState.reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts}) in ${delay}ms`);

  if (reconnectTimer) clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(async () => {
    try {
      await initializeDatabaseConnection();
      logger.info('✅ Database reconnection successful');
    } catch (error) {
      logger.error(`❌ Reconnection attempt ${dbState.reconnectAttempts} failed:`, error);

      if (dbState.reconnectAttempts < RECONNECT_CONFIG.maxAttempts) {
        await attemptReconnection();
      }
    }
  }, delay);
}

// Health check function
async function performHealthCheck(): Promise<boolean> {
  try {
    const startTime = Date.now();
    await databaseClient.raw('SELECT 1 as health_check');
    const responseTime = Date.now() - startTime;

    if (responseTime > 5000) {
      logger.warn(`⚠️ Slow database response: ${responseTime}ms`);
    }

    if (!dbState.isConnected) {
      dbState.isConnected = true;
      logger.info('✅ Database connection restored');
    }

    dbState.lastHealthCheck = Date.now();
    return true;
  } catch (error) {
    logger.error('❌ Database health check failed:', error);

    if (dbState.isConnected) {
      dbState.isConnected = false;
      logger.warn('🔌 Database connection lost, attempting reconnection...');
      await attemptReconnection();
    }

    return false;
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

      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Query timeout')), RECONNECT_CONFIG.queryTimeout);
        })
      ]);

      return result;
    } catch (error: any) {
      const isConnectionError = error.code === 'PROTOCOL_CONNECTION_LOST' ||
                               error.code === 'ECONNRESET' ||
                               error.code === 'ETIMEDOUT' ||
                               error.message?.includes('Connection lost');

      if (isConnectionError && attempt < retryCount) {
        logger.warn(`🔄 Connection error, retrying query (attempt ${attempt}/${retryCount})`);

        if (dbState.isConnected) {
          dbState.isConnected = false;
          attemptReconnection();
        }

        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
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
 * Load setting from database with error handling and validation
 * @param which - The setting key to retrieve
 * @returns Promise resolving to the setting value
 * @throws Error if setting key is invalid or database query fails
 */
export async function loadGlobalSetting(which: GlobalSettingKey): Promise<any> {
  try {
    const settings = await executeQuery(() =>
      databaseClient<GlobalSettings>('global_smokeybot_settings').first()
    );

    if (!settings) {
      throw new Error('No global settings found in database');
    }

    if (!(which in settings)) {
      throw new Error(`Setting key '${which}' not found in global settings`);
    }

    return settings[which];
  } catch (error) {
    logger.error(`Failed to load global setting '${which}':`, error);
    throw error;
  }
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
 * Retrieves guild settings from database, creating new settings if they don't exist
 * @param guild - Discord Guild object
 * @returns Promise resolving to guild settings or undefined if creation fails
 */
export async function getGuildSettings(guild: Guild): Promise<IGuildSettings | undefined> {
  try {
    let guildSettings = await executeQuery(() =>
      databaseClient<IGuildSettings>(GuildSettingsTable)
        .select()
        .where('guild_id', guild.id)
        .first()
    );

    if (!guildSettings) {
      logger.info(`No settings found for guild ${guild.name} (${guild.id}), creating new settings`);

      const insertResult = await executeQuery(() =>
        databaseClient<IGuildSettings>(GuildSettingsTable).insert({
          guild_id: guild.id,
          smokemon_enabled: 0,
          announcements_enabled: 0,
        })
      );

      if (insertResult && insertResult.length > 0) {
        logger.info(`Created new guild settings for ${guild.name} (${guild.id})`);

        // Fetch the newly created settings
        guildSettings = await executeQuery(() =>
          databaseClient<IGuildSettings>(GuildSettingsTable)
            .select()
            .where('guild_id', guild.id)
            .first()
        );
      } else {
        logger.error(`Failed to create guild settings for ${guild.name} (${guild.id})`);
        return undefined;
      }
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
    const insertResult = await executeQuery(() =>
      databaseClient<IGuildSettings>(GuildSettingsTable).insert({
        guild_id: interaction.guild.id,
        smokemon_enabled: 0,
        announcements_enabled: 0,
      })
    );

    if (!insertResult || insertResult.length === 0) {
      throw new Error('Database insertion returned no results');
    }

    logger.info(`Created new guild settings for ${interaction.guild.name} (${interaction.guild.id})`);

    return insertResult[0];
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
  };
}