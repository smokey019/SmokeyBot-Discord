
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

export const databaseClient: Knex = knex({
  client: 'mysql2',
  connection: {
    database: process.env.DB_DATABASE!,
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    password: process.env.DB_PASSWORD!,
    user: process.env.DB_USER!,
    charset: 'utf8mb4',
    timezone: 'UTC',
  },
  pool: {
    min: 0,
    max: 7,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
    propagateCreateError: false
  },
  acquireConnectionTimeout: 30000,
  log: {
    warn(message: string) {
      logger.warn(message);
    },
    error(message: string) {
      logger.error(message);
    },
    deprecate(message: string) {
      logger.warn(`DEPRECATED: ${message}`);
    },
    debug(message: string) {
      logger.debug(message);
    },
  },
});

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
    const settings = await databaseClient<GlobalSettings>('global_smokeybot_settings').first();

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
    let guildSettings = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .select()
      .where('guild_id', guild.id)
      .first();

    if (!guildSettings) {
      logger.info(`No settings found for guild ${guild.name} (${guild.id}), creating new settings`);

      const insertResult = await databaseClient<IGuildSettings>(GuildSettingsTable).insert({
        guild_id: guild.id,
        smokemon_enabled: 0,
        announcements_enabled: 0,
      });

      if (insertResult && insertResult.length > 0) {
        logger.info(`Created new guild settings for ${guild.name} (${guild.id})`);

        // Fetch the newly created settings
        guildSettings = await databaseClient<IGuildSettings>(GuildSettingsTable)
          .select()
          .where('guild_id', guild.id)
          .first();
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
    const result = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .count('* as count')
      .first();

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
    const userSettings = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .select()
      .where('uid', uid)
      .first();

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
    const insertResult = await databaseClient<IGuildSettings>(GuildSettingsTable).insert({
      guild_id: interaction.guild.id,
      smokemon_enabled: 0,
      announcements_enabled: 0,
    });

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
    await databaseClient.raw('SELECT 1');
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
    await databaseClient.destroy();
    logger.info('Database connection closed successfully');
  } catch (error) {
    logger.error('Error closing database connection:', error);
    throw error;
  }
}