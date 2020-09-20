import { Message } from 'discord.js';
import knex from 'knex';
import { getConfigValue } from '../config';
import { IMonsterUserModel, MonsterUserTable } from '../models/MonsterUser';
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
			logger.warn(message);
		},
		error(message) {
			logger.error(message);
		},
		deprecate(message) {
			logger.error(message);
		},
		debug(message) {
			logger.debug(message);
		},
	},
});

/**
 * Pulls guild settings from database. Creates new settings if needed.
 *
 * @param Message Discord Message Object
 */
export async function getGuildSettings(
	message: Message,
): Promise<IGuildSettings> {
	const guild_settings = await databaseClient<IGuildSettings>(
		GuildSettingsTable,
	)
		.select()
		.where('guild_id', message.guild.id);

	if (!guild_settings[0]) {
		const insert = await databaseClient<IGuildSettings>(
			GuildSettingsTable,
		).insert({
			guild_id: message.guild.id,
			smokemon_enabled: 0,
		});

		if (insert) {
			logger.info(`Created new guild settings for ${message.guild.name}.`);

			const guild_settings = await databaseClient<IGuildSettings>(
				GuildSettingsTable,
			)
				.select()
				.where('guild_id', message.guild.id);
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
