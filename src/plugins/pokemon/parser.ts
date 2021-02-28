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
  searchMonsters
} from './check-monsters';
import { checkExpGain } from './exp-gain';
import {
  checkUniqueMonsters,
  currentMonsterInfo,
  currentMonsterInfoBETA,
  monsterDex,
  monsterInfo,
  monsterInfoLatest
} from './info';
import { msgBalance, parseItems } from './items';
import { checkLeaderboard } from './leaderboard';
import { selectMonster, setFavorite, unFavorite } from './monsters';
import { setNickname } from './nickname';
import { recoverMonster, releaseMonster } from './release-monster';
import { MONSTER_SPAWNS, spawnMonster } from './spawn-monster';
import { parseTrade } from './trading';
import {
  checkServerWeather,
  getBotStats,
  parseArgs,
  voteCommand
} from './utils';

export const GUILD_PREFIXES = new Keyv(
	`mysql://${getConfigValue('DB_USER')}:${getConfigValue(
		'DB_PASSWORD',
	)}@${getConfigValue('DB_HOST')}:${getConfigValue('DB_PORT')}/${getConfigValue(
		'DB_DATABASE',
	)}`,
	{ keySize: 191, namespace: 'GUILD_PREFIXES2' },
);

export const default_prefixes = ['!', '~', 'p!'];

export async function set_prefix(message: Message): Promise<void> {
	let i = 0;
	const parse = await parseArgs(message);
	const prefixes =
		(await GUILD_PREFIXES.get(message.guild.id)) || default_prefixes;

	if (!parse.args[1] || !parse.args[2] && parse.args[1] != 'default') {
		await message.reply(
			'not enough parameters. Example: `!prefix enable !`. Type `!prefix help` for more information.',
		);
		return;
	}

	if (parse.args[1] == 'enable') {
		switch (parse.args[2]) {
			case '!':
				if (!prefixes.includes('!')) {
					prefixes.push('!');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
					await message.reply('successfully added `!` as a prefix. Your prefixes are now: `' + prefixes.join(' ') + '`.');
				}

				break;
			case '?':
				if (!prefixes.includes('\\?')) {
					prefixes.push('\\?');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
					await message.reply('successfully added `?` as a prefix.  Your prefixes are now: `' + prefixes.join(' ') + '`.');
				}

				break;
			case '~':
				if (!prefixes.includes('~')) {
					prefixes.push('~');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
					await message.reply('successfully added `~` as a prefix.  Your prefixes are now: `' + prefixes.join(' ') + '`.');
				}

				break;
			case 'p!':
				if (!prefixes.includes('p!')) {
					prefixes.push('p!');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
					await message.reply('successfully added `p!` as a prefix.  Your prefixes are now: `' + prefixes.join(' ') + '`.');
				}

				break;

			default:
				await message.reply(
					'you can enable/disable these prefixes: ' + prefixes,
				);
				break;
		}
	} else if (parse.args[1] == 'disable') {
		switch (parse.args[2]) {
			case '!':
				if (prefixes.includes('!') && prefixes.length > 1) {
					for (i = 0; i < prefixes.length; i++) {
						if (prefixes[i] === '!') {
							prefixes.splice(i, 1);
						}
					}
					await message.reply('successfully removed `!` as a prefix.  Your prefixes are now: `' + prefixes.join(' ') + '`.');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
				}

				break;
			case '?':
				if (prefixes.includes('\\?') && prefixes.length > 1) {
					for (i = 0; i < prefixes.length; i++) {
						if (prefixes[i] === '\\?') {
							prefixes.splice(i, 1);
						}
					}
					await message.reply('successfully removed `?` as a prefix.  Your prefixes are now: `' + prefixes.join(' ') + '`.');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
				}

				break;
			case '~':
				if (prefixes.includes('~') && prefixes.length > 1) {
					for (i = 0; i < prefixes.length; i++) {
						if (prefixes[i] === '~') {
							prefixes.splice(i, 1);
						}
					}
					await message.reply('successfully removed `~` as a prefix.  Your prefixes are now: `' + prefixes.join(' ') + '`.');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
				}

				break;
			case 'p!':
				if (prefixes.includes('p!') && prefixes.length > 1) {
					for (i = 0; i < prefixes.length; i++) {
						if (prefixes[i] === 'p!') {
							prefixes.splice(i, 1);
						}
					}
					await message.reply('successfully removed `p!` as a prefix.  Your prefixes are now: `' + prefixes.join(' ') + '`.');
					await GUILD_PREFIXES.set(message.guild.id, prefixes);
				}

				break;

			default:
				await message.reply(
					'you can enable/disable these prefixes: ' + prefixes,
				);
				break;
		}
	} else if (parse.args[1] == 'default') {
		await GUILD_PREFIXES.set(message.guild.id, default_prefixes);
		await message.reply(
			'successfully reset prefixes back to default: ' +
				default_prefixes.join(', '),
		);
	} else if (parse.args[1] == 'help') {
		await message.reply(
			'enable/disable prefixes: `!prefix disable ~` or `!prefix enable p!`. By default SmokeyBot uses: `' +
				default_prefixes.join(' ') +
				'`.',
		);
	}
}

export async function prefix_check(message: Message): Promise<boolean> {
	const prefixes =
		(await GUILD_PREFIXES.get(message.guild.id)) || default_prefixes;

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
	await checkExpGain(message);

	const channel_name = (message.channel as TextChannel).name;
	const GCD = await getGCD(message.guild.id);
	const timestamp = getCurrentTime();
	const spawn = await MONSTER_SPAWNS.get(message.guild.id);
	const load_prefixes =
		(await GUILD_PREFIXES.get(message.guild.id)) || default_prefixes;
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
