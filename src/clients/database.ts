import { CommandInteraction, Guild } from 'discord.js';
import knex from 'knex';
import { getConfigValue } from '../config';
import { IMonsterUserModel, MonsterUserTable } from '../models/MonsterUser';
import { SMOKEYBOT_GLOBAL_SETTINGS_CACHE } from './cache';
import { getLogger } from './logger';

const logger = getLogger('Database');

export const databaseClient = knex({
  client: 'mysql2',
  connection: {
    database: getConfigValue('DB_DATABASE'),
    host: getConfigValue('DB_HOST'),
    port: parseInt(getConfigValue('DB_PORT')),
    password: getConfigValue('DB_PASSWORD'),
    user: getConfigValue('DB_USER'),
  },
  pool: { min: 0, max: 7 },
  log: {
    warn(message) {
      console.error(message);
    },
    error(message) {
      console.error(message);
    },
    deprecate(message) {
      console.error(message);
    },
    debug(message) {
      logger.debug(message);
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadGlobalSetting(which: string): Promise<any> {
  let settings = await SMOKEYBOT_GLOBAL_SETTINGS_CACHE?.get('main');

  if (!settings) {
    settings = await databaseClient('global_smokeybot_settings').first();

    SMOKEYBOT_GLOBAL_SETTINGS_CACHE?.set('main', settings);

    switch (which) {
      case 'pokemon_user_boost':
        return settings.pokemon_user_boost;
      case 'pokemon_pool_size':
        return settings.pokemon_pool_size;
      case 'global_cooldown':
        return settings.global_cooldown;
      case 'personal_cooldown':
        return settings.personal_cooldown;
      case 'pokemon_spawn_time_min':
        return settings.pokemon_spawn_time_min;
      case 'pokemon_spawn_time_max':
        return settings.pokemon_spawn_time_max;
      case 'shiny_odds_retail':
        return settings.shiny_odds_retail;
      case 'shiny_odds_smokemon':
        return settings.shiny_odds_smokemon;
      case 'perfect_iv_odds':
        return settings.perfect_iv_odds;
    }
  } else {
    switch (which) {
      case 'pokemon_user_boost':
        return settings.pokemon_user_boost;
      case 'pokemon_pool_size':
        return settings.pokemon_pool_size;
      case 'global_cooldown':
        return settings.global_cooldown;
      case 'personal_cooldown':
        return settings.personal_cooldown;
      case 'pokemon_spawn_time_min':
        return settings.pokemon_spawn_time_min;
      case 'pokemon_spawn_time_max':
        return settings.pokemon_spawn_time_max;
      case 'shiny_odds_retail':
        return settings.shiny_odds_retail;
      case 'shiny_odds_smokemon':
        return settings.shiny_odds_smokemon;
      case 'perfect_iv_odds':
        return settings.perfect_iv_odds;
    }
  }
}

/**
 * Pulls guild settings from database. Creates new settings if needed.
 *
 * @param Message Discord Message Object
 */
export async function getGuildSettings(
  guild: Guild,
): Promise<IGuildSettings | undefined> {
  const guild_settings = await databaseClient<IGuildSettings>(
    GuildSettingsTable,
  )
    .select()
    .where('guild_id', guild.id);

  if (!guild_settings[0]) {
    const insert = await databaseClient<IGuildSettings>(
      GuildSettingsTable,
    ).insert({
      guild_id: guild.id,
      smokemon_enabled: 0,
    });

    if (insert) {
      logger.info(`Created new guild settings for ${guild.name}.`);

      const guild_settings = await databaseClient<IGuildSettings>(
        GuildSettingsTable,
      )
        .select()
        .where('guild_id', guild.id);
      if (guild_settings) {
        return guild_settings[0];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  } else {
    return guild_settings[0];
  }
}

export async function getUserDBCount(): Promise<number> {
  const user_settings = await databaseClient<IMonsterUserModel>(
    MonsterUserTable,
  ).select();

  return user_settings.length;
}

/**
 * WIP
 * @param uid
 */
export async function getUser(
  uid: number | string,
): Promise<IMonsterUserModel> {
  const user_settings = await databaseClient<IMonsterUserModel>(
    MonsterUserTable,
  )
    .select()
    .where('uid', uid);

  return user_settings[0];
}

/**
 * Inserts new GuildSettings into database.
 *
 * @param message Discord Message Object
 */
export async function putGuildSettings(interaction: CommandInteraction): Promise<number> {
  const insert =
    interaction.guild != null
      ? await databaseClient<IGuildSettings>(GuildSettingsTable).insert({
          guild_id: interaction.guild.id,
          smokemon_enabled: 0,
        })
      : [];

  logger.info(`Created new guild settings for ${interaction.guild.name}.`);

  console.log(insert);

  return insert[0];
}

export const GuildSettingsTable = 'guild_settings';

export interface IGuildSettings {
  id: number;
  guild_id: number | string;
  smokemon_enabled: number;
  specific_channel: string;
  prefixes: string;
}
