import { Message, TextChannel } from 'discord.js';
import { ICache, GLOBAL_COOLDOWN, getGCD } from '../../clients/cache';
import { catchMonster } from './catch-monster';
import {
	userDex,
	monsterDex,
	monsterInfo,
	monsterInfoLatest,
	currentMonsterInfo,
} from './info';
import { theWord, getCurrentTime } from '../../utils';
import {
	checkMonsters,
	checkFavorites,
	searchMonsters,
	checkPokedex,
} from './check-monsters';
import { releaseMonster, recoverMonster } from './release-monster';
import { selectMonster, setFavorite, unFavorite } from './monsters';
import { checkExpGain } from './exp-gain';
import { parseTrade } from './trading';
import { msgBalance, parseItems } from './items';
import { battleParser } from './battle';
import { getBoostedWeatherSpawns } from './weather';
import { MONSTER_SPAWNS } from './spawn-monster';
import { checkVote } from '../../clients/top.gg';
import Keyv from 'keyv';
import { getConfigValue } from '../../config';

const GUILD_PREFIXES = new Keyv(
	`mysql://${getConfigValue('DB_USER')}:${getConfigValue(
		'DB_PASSWORD',
	)}@${getConfigValue('DB_HOST')}:3306/${getConfigValue('DB_DATABASE')}`,
	{ keySize: 191, namespace: 'GUILD_PREFIXES' },
);

const global_prefixes = ['!', '~', 'p!'];

export function prefix_regex(command: string): RegExp {
	return RegExp('(' + global_prefixes.join('|') + ')(' + command + ')', 'i');
}

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
	const channel_name = (message.channel as TextChannel).name;
	const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');
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
		.replace(/ {2,}/gm, ' ')
		.split(/ +/);
	const command = args.shift().toLowerCase();

	checkExpGain(message);

	if (
		spawn.monster &&
		splitMsg.length > 1 &&
		(command == 'catch' ||
			command == 'キャッチ' ||
			command == '抓住' ||
			command == 'capture')
	) {
		catchMonster(message);
	} else if (timestamp - GCD > 3) {
		if (command == 'unique') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			const tempdex = await userDex(message);
			await message.reply(
				`You have ${tempdex.length} total unique ${theWord()} in your Pokédex.`,
			);
		}

		if (
			command == 'bal' ||
			command == 'balance' ||
			command == 'currency' ||
			command == 'bank'
		) {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await msgBalance(message);
		}

		if (command == 'weather') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			const boost = await getBoostedWeatherSpawns(message.guild.id);

			await message.reply(
				`the current weather is **${
					boost.weather
				}**.  You will find increased spawns of **${boost.boosts.join(
					' / ',
				)}** on this server.`,
			);
		}

		if (command == 'vote') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await message.reply(
				`vote here and get free stuff for the ${theWord()} plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
			);
		}

		if (command == 'check-vote') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await checkVote(message);
		}

		if (command == 'battle') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await battleParser(message);
		}

		if (command == 'pokedex') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await checkPokedex(message);
		}

		if (command == 'item') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await parseItems(message);
		}

		if (command == 'trade' || command == 't') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await parseTrade(message);
		}

		if (command == 'dex' || command == 'd') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await monsterDex(message);
		}

		if (command == 'search' || command == 's') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await searchMonsters(message);
		}
		if (command == 'pokemon' || command == 'p') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await checkMonsters(message);
		}

		if (
			(command == 'info' && args[0]?.match(/\d+/)) ||
			(command == 'i' && args[0]?.match(/\d+/))
		) {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await monsterInfo(message);
		}

		if (
			(command == 'info' && args.length == 0) ||
			(command == 'i' && args.length == 0)
		) {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await currentMonsterInfo(message);
		}

		if (
			(command == 'info' && args[0] == 'latest') ||
			(command == 'i' && args[0] == 'l')
		) {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await monsterInfoLatest(message);
		}

		if (command == 'release' || command == 'r') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await releaseMonster(message);
		}

		if (command == 'recover') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await recoverMonster(message);
		}

		if (command == 'select') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await selectMonster(message);
		}

		if (command == 'favorites' || command == 'favourites') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await checkFavorites(message);
		}

		if (command == 'favorite' || command == 'favourite') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await setFavorite(message);
		}

		if (command == 'unfavorite' || command == 'unfavourite') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await unFavorite(message);
		}
	}
}
