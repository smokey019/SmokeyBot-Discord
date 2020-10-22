import { Message, MessageEmbed } from 'discord.js';
import { GLOBAL_COOLDOWN } from '../../clients/cache';
import { getUserDBCount } from '../../clients/database';
import { discordClient } from '../../clients/discord';
import { EmoteQueue } from '../../clients/queue';
import { dblCache } from '../../clients/top.gg';
import { COLOR_BLACK } from '../../colors';
import {
	format_number,
	getCurrentTime,
	getRndInteger,
	theWord,
} from '../../utils';
import { getMonsterDBCount, getShinyMonsterDBCount } from './monsters';
import { getBoostedWeatherSpawns } from './weather';

// const SHINY_ODDS_RETAIL = parseInt(getConfigValue('SHINY_ODDS_RETAIL'));
// const SHINY_ODDS_COMMUNITY = parseInt(getConfigValue('SHINY_ODDS_COMMUNITY'));

/**
 * Returns a randomized level.
 */
export function rollLevel(min: number, max: number): number {
	return getRndInteger(min, max);
}

/**
 * Returns a randomized value for if an item is shiny. (1 is shiny, 0 is not)
 */
export function rollShiny(): 0 | 1 {
	return getRndInteger(1, 665) >= 665 ? 1 : 0;
}

export function rollPerfectIV(): 0 | 1 {
	return getRndInteger(1, 100) >= 100 ? 1 : 0;
}

export async function voteCommand(message: Message): Promise<void> {
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

export async function checkServerWeather(message: Message): Promise<void> {
	const boost = await getBoostedWeatherSpawns(message.guild.id);

	await message.reply(
		`the current weather is **${
			boost.weather
		}**.  You will find increased spawns of **${boost.boosts.join(
			' / ',
		)}** on this server.`,
	);
}

export async function getBotStats(message: Message): Promise<void> {
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

export const img_monster_ball = `https://cdn.discordapp.com/attachments/550103813587992586/721256683665621092/pokeball2.png`;
