import { Message, MessageEmbed, TextChannel } from 'discord.js';
import Keyv from 'keyv';
import { getGCD, GLOBAL_COOLDOWN, ICache } from '../../clients/cache';
import { getUserDBCount } from '../../clients/database';
import { discordClient } from '../../clients/discord';
import { EmoteQueue } from '../../clients/queue';
import { checkVote, dblCache } from '../../clients/top.gg';
import { COLOR_BLACK } from '../../colors';
import { getConfigValue } from '../../config';
import { format_number, getCurrentTime, theWord } from '../../utils';
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
	currentMonsterInfo,
	currentMonsterInfoBETA,
	monsterDex,
	monsterInfo,
	monsterInfoLatest,
	userDex,
} from './info';
import { msgBalance, parseItems } from './items';
import { checkLeaderboard } from './leaderboard';
import {
	getMonsterDBCount,
	getShinyMonsterDBCount,
	selectMonster,
	setFavorite,
	unFavorite,
} from './monsters';
import { setNickname } from './nickname';
import { recoverMonster, releaseMonster } from './release-monster';
import { MONSTER_SPAWNS, spawnMonster } from './spawn-monster';
import { parseTrade } from './trading';
import { getBoostedWeatherSpawns } from './weather';

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
		catchMonster(message);
	} else if (timestamp - GCD > 3) {
		if (command == 'unique') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			const tempdex = await userDex(message);
			await message.reply(
				`You have ${tempdex.length} total unique ${theWord()} in your Pokédex.`,
			);
		}

		if (command == 'leaderboard') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
			await checkLeaderboard(message);
		}

		if (command == 'stats') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
			const ping = Date.now() - message.createdTimestamp;

			const embed = new MessageEmbed()
				.setColor(COLOR_BLACK)
				.setTitle('SmokeyBot Statistics')
				.addField('Ping', ping + ' ms', true)
				.addField(
					'Total Guilds in Emote Queue',
					format_number(EmoteQueue.size),
					true,
				)
				.addField(
					'Total Guilds',
					format_number(discordClient.guilds.cache.size),
					true,
				)
				.addField(
					'Total ' + theWord(),
					format_number(await getMonsterDBCount()),
					true,
				)
				.addField(
					'Total Shiny ' + theWord(),
					format_number(await getShinyMonsterDBCount()),
					true,
				)
				.addField(
					'Total ' + theWord() + ' Users',
					format_number(await getUserDBCount()),
					true,
				)
				.setTimestamp();

			await message.reply(embed);
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

		if (command == 'nickname' || command == 'nick') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			switch (args[0]) {
				case 'set':
					await setNickname(message);
			}
		}

		if (command == 'vote') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			const voted = await dblCache.get(message.author.id + ':voted');

			if (!voted) {
				await message.reply(
					`you haven't voted yet -- vote here and get free stuff for the ${theWord()} plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
				);
			} else {
				await message.reply(
					`you've already voted, but maybe others want to vote here and get free stuff for the ${theWord()} plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
				);
			}
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

		if (command == 'spawn' && message.author.id == '90514165138989056') {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await spawnMonster(message, cache);
		}

		if (
			(command == 'info' && args[0]?.match(/\d+/)) ||
			(command == 'i' && args[0]?.match(/\d+/))
		) {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await monsterInfo(message);
		}

		if (
			(command == 'infobeta' && args.length == 0) ||
			(command == 'ib' && args.length == 0)
		) {
			await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

			await currentMonsterInfoBETA(message);
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
