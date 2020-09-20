import { Message } from 'discord.js';
import Keyv from 'keyv';
import { getConfigValue } from '../config';
import { getCurrentTime } from '../utils';
import { IGuildSettings } from './database';
import { getLogger } from './logger';

const logger = getLogger('Cache');

export interface ICache {
	tweet: undefined | any;
	settings: {
		id: number;
		guild_id: number | string;
		smokemon_enabled: number;
		specific_channel: string;
	};
}

export const cacheClient = new Keyv<ICache>(
	`mysql://${getConfigValue('DB_USER')}:${getConfigValue(
		'DB_PASSWORD',
	)}@${getConfigValue('DB_HOST')}:${getConfigValue('DB_PORT')}/${getConfigValue(
		'DB_DATABASE',
	)}`,
	{ keySize: 191, namespace: 'cacheClient', pool: { min: 0, max: 7 } },
);
export const xp_cache = new Keyv({ namespace: 'xp_cache' });
export const cacheTwitter = new Keyv({ namespace: 'cacheTwitter' });
export const cacheTweets = new Keyv({ namespace: 'cacheTweets' });
export const cacheToBeDeleted = new Keyv({ namespace: 'cacheToBeDeleted' });
export const GLOBAL_COOLDOWN = new Keyv({ namespace: 'GLOBAL_COOLDOWN' });

cacheClient.on('error', (error) => logger.error(error));
xp_cache.on('error', (error) => logger.error(error));
cacheTwitter.on('error', (error) => logger.error(error));
cacheTweets.on('error', (error) => logger.error(error));
cacheToBeDeleted.on('error', (error) => logger.error(error));

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

export async function setGCD(guild_id: string): Promise<boolean> {
	return await GLOBAL_COOLDOWN.set(guild_id, getCurrentTime());
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
