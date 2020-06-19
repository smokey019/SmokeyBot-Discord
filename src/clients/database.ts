import knex from 'knex';

import { getConfigValue } from '../config';
import { getLogger } from './logger';
import { Message } from 'discord.js';

const logger = getLogger('Database');

export const databaseClient = knex({
  client: 'mysql',
  connection: {
    database: getConfigValue('DB_DATABASE'),
    host: getConfigValue('DB_HOST'),
    password: getConfigValue('DB_PASSWORD'),
    user: getConfigValue('DB_USER'),
  },
  pool: { min: 0, max: 7 },
});

/**
 * Pulls guild settings from database.
 *
 * @param guild_id Discord Guild ID
 */
export async function getGuildSettings(
  guild_id: number | string,
): Promise<any> {
  const guild_settings = await databaseClient<IGuildSettings>(
    GuildSettingsTable,
  )
    .select()
    .where('guild_id', guild_id);

  return guild_settings[0];
}

/**
 * WIP
 * @param uid
 */
export async function getMonsterUser(uid: number | string): Promise<any> {
  const user_settings = await databaseClient<IUserSettings>(UserSettingsTable)
    .select()
    .where('uid', uid);

  return user_settings[0];
}

/**
 * Inserts new GuildSettings into database.
 *
 * @param message Discord Message Object
 */
export async function putGuildSettings(message: Message): Promise<number> {
  const insert =
    message.guild != null
      ? await databaseClient<IGuildSettings>(GuildSettingsTable).insert({
          guild_id: message.guild.id,
          smokemon_enabled: 0,
        })
      : [];

  logger.info(`Created new guild settings for ${message.guild.name}.`);

  console.log(insert);

  return insert[0];
}

export const GuildSettingsTable = 'guild_settings';

export interface IGuildSettings {
  id: number;
  guild_id: number | string;
  smokemon_enabled: number;
  specific_channel: string;
}

export const UserSettingsTable = 'smokemon_users';

export interface IUserSettings {
  id: number;
  uid: number;
  currency: number;
  current_monster: number;
  latest_monster: number;
  items: [];
}
