import { Message, TextChannel } from 'discord.js';
import Keyv from 'keyv';
import { getGCD, GLOBAL_COOLDOWN, ICache } from '../../clients/cache';
import { checkVote } from '../../clients/top.gg';
import { getConfigValue } from '../../config';
import { getCurrentTime } from '../../utils';
import { battleParser } from './battle';
import { catchMonster } from './catch-monster';
import {
	checkFavorites,
	checkMonsters,
	checkPokedex,
	searchMonsters,
} from './check-monsters';
import { checkExpGain } from './exp-gain';
import {
	checkUniqueMonsters,
	currentMonsterInfo,
	currentMonsterInfoBETA,
	monsterDex,
	monsterInfo,
	monsterInfoLatest,
} from './info';
import { msgBalance, parseItems } from './items';
import { checkLeaderboard } from './leaderboard';
import { selectMonster, setFavorite, unFavorite } from './monsters';
import { setNickname } from './nickname';
import { recoverMonster, releaseMonster } from './release-monster';
import { MONSTER_SPAWNS, spawnMonster } from './spawn-monster';
import { parseTrade } from './trading';
import { checkServerWeather, getBotStats, voteCommand } from './utils';

export const GUILD_PREFIXES = new Keyv(
	`mysql://${getConfigValue('DB_USER')}:${getConfigValue(
		'DB_PASSWORD',
	)}@${getConfigValue('DB_HOST')}:${getConfigValue('DB_PORT')}/${getConfigValue(
		'DB_DATABASE',
	)}`,
	{ keySize: 191, namespace: 'GUILD_PREFIXES' },
);

export const global_prefixes = ['!', '~', 'p!'];

export async function prefix_check(message: Message): Promise<boolean> {
	const prefixes =
		(await GUILD_PREFIXES.get(message.guild.id)) || global_prefixes;

	if (prefixes.includes(message.content.charAt(0))) {
		return true;
	} else {
		return false;
	}
}

export async function monsterParser(
	message: Message,
	cache: ICache,
): Promise<void> {
	checkExpGain(message);

	const channel_name = (message.channel as TextChannel).name;
	const GCD = await getGCD(message.guild.id);
	const timestamp = getCurrentTime();
	const spawn = await MONSTER_SPAWNS.get(message.guild.id);
	const load_prefixes =
		(await GUILD_PREFIXES.get(message.guild.id)) || global_prefixes;
	const prefixes = RegExp(load_prefixes.join('|'));
	const detect_prefix = message.content.match(prefixes);

	if (channel_name != cache.settings.specific_channel || !detect_prefix) return;
	const prefix = detect_prefix.shift();
	const args = message.content
		.slice(prefix.length)
		.trim()
		.toLowerCase()
		.replace(/ {2,}/gm, ' ')
		.split(/ +/);
	const command = args.shift();

	if (
		spawn.monster &&
		args &&
		(command == 'catch' ||
			command == 'キャッチ' ||
			command == '抓住' ||
			command == 'capture')
	) {
		await catchMonster(message);
	} else if (timestamp - GCD > 3) {
		switch (command) {
			case 'unique':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
				await checkUniqueMonsters(message);

				break;

			case 'leaderboard':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
				await checkLeaderboard(message);

				break;

			case 'stats':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
				await getBotStats(message);

				break;

			case 'bal':
			case 'balance':
			case 'currency':
			case 'bank':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await msgBalance(message);

				break;

			case 'weather':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
				await checkServerWeather(message);

				break;

			case 'nickname':
			case 'nick':
				if (args[0] == 'set') {
					await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
					await setNickname(message);
				}

				break;

			case 'vote':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
				await voteCommand(message);

				break;

			case 'check-vote':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await checkVote(message);

				break;

			case 'pokedex':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await checkPokedex(message);

				break;

			case 'item':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await parseItems(message);

				break;

			case 'trade':
			case 't':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await parseTrade(message);

				break;

			case 'dex':
			case 'd':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await monsterDex(message);

				break;

			case 'search':
			case 's':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await searchMonsters(message);

				break;

			case 'pokemon':
			case 'p':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await checkMonsters(message);

				break;

			case 'spawn':
				if (message.author.id == '90514165138989056') {
					await spawnMonster(message, cache);
				}

				break;

			case 'info':
			case 'i':
				if (args[0]?.match(/\d+/)) {
					await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

					await monsterInfo(message);
				} else if (args.length == 0) {
					await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

					await currentMonsterInfo(message);
				} else if (args[0] == 'latest' || args[0] == 'l') {
					await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

					await monsterInfoLatest(message);
				}

				break;

			case 'ib':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await currentMonsterInfoBETA(message);

				break;

			case 'release':
			case 'r':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await releaseMonster(message);

				break;

			case 'recover':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await recoverMonster(message);

				break;

			case 'select':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await selectMonster(message);

				break;

			case 'favorites':
			case 'favourites':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await checkFavorites(message);

				break;

			case 'favorite':
			case 'favourite':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await setFavorite(message);

				break;

			case 'unfavorite':
			case 'unfavourite':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await unFavorite(message);

				break;

			case 'battle':
				await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

				await battleParser(message);

				break;
		}
	}
}
