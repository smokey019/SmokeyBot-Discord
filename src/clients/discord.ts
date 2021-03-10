import { Client, Message } from 'discord.js';
import { findMonsterByID, getAllMonsters, getRandomMonster, MonsterDex } from '../plugins/pokemon/monsters';
import { monsterParser } from '../plugins/pokemon/parser';
import { MONSTER_SPAWNS, spawnMonster } from '../plugins/pokemon/spawn-monster';
import { smokeybotParser } from '../plugins/smokeybot/parser';
import { format_number, getCurrentTime, getRndInteger } from '../utils';
import { getCache, getGCD, ICache } from './cache';
import { getGuildSettings, IGuildSettings } from './database';
import { getLogger } from './logger';
import { dblClient } from './top.gg';

const logger = getLogger('DiscordClient');
export let rateLimited = false;

export const discordClient = new Client({ retryLimit: 5 });

discordClient.on('ready', () => {
	logger.info('Fully initialized.');
  logger.info(`Total MonsterPool: ${getAllMonsters().length}.`);
  logger.info(`Total Monsters: ${MonsterDex.size}.`);
  logger.info(
    `Random Monster: ${findMonsterByID(getRandomMonster()).name.english}.`,
  );
	setInterval(async () => {
		await dblClient.postStats(discordClient.guilds.cache.size);
	}, 1800000);
});

discordClient.on('rateLimit', (error) => {
	const timeoutStr = error.timeout / 1000;
	logger.warn(`Rate Limited.. waiting ${format_number(timeoutStr / 60)} minutes.`);

	rateLimited = true;

	setTimeout(() => {
		logger.warn('Rate limit timeout elapsed.');
		rateLimited = false;
	}, error.timeout);
});

discordClient.on('message', async (message) => {
	try {
		await parseMessage(message);
	} catch (error) {
		logger.error(error);
	}
});

async function parseMessage(message: Message) {
	const timestamp = getCurrentTime();

	if (
		!message.member ||
		message.member.user.username == 'smokeybot' ||
		rateLimited ||
		message.author.bot
	) {
		return;
	}

	const settings: IGuildSettings = await getGuildSettings(message);

	const cache: ICache = await getCache(message, settings);

	const GCD: number = await getGCD(message.guild.id);

	if (cache && settings) {
		if (timestamp - GCD > 5) {
			await smokeybotParser(message, cache);
		}

		if (cache.settings.smokemon_enabled) {
			let spawn = await MONSTER_SPAWNS.get(message.guild.id);

			if (!spawn) {
				spawn = {
					monster: undefined,
					spawned_at: getCurrentTime() - 30,
				};
				await MONSTER_SPAWNS.set(message.guild.id, spawn);
				await monsterParser(message, cache);
			} else {
				const spawn_timer = getRndInteger(30, 1800);

				if (
					timestamp - spawn.spawned_at > spawn_timer &&
					!message.content.match(/catch/i)
				) {
					await spawnMonster(message, cache);
				}

				await monsterParser(message, cache);
			}
		}
	} else if (!cache) {
		logger.error(
			`Missing cache for ${message.guild.id} - ${message.guild.name}.`,
		);
	} else if (!settings) {
		logger.error(
			`Missing settings for ${message.guild.id} - ${message.guild.name}.`,
		);
	}
}
