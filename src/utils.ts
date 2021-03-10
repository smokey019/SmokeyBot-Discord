import datetimeDifference from 'datetime-difference';
import { Message, MessageEmbed } from 'discord.js';
import moment from 'moment';
import fetch from 'node-fetch';
import { getGCD, GLOBAL_COOLDOWN } from './clients/cache';
import { getLogger } from './clients/logger';

const logger = getLogger('Utilities');

export async function asyncForEach(array, callback): Promise<void> {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array);
	}
}

/**
 * Send Message on Discord
 * @param title
 * @param msg
 * @param message
 * @param color
 */
export async function send_message(
	msg: string,
	message: Message,
	title: 'SmokeyBot',
	color = 0xff0000,
): Promise<Message | boolean | void> {
	if (!msg || !message) return false;

	const timestamp = getCurrentTime();
	const GCD = await getGCD(message.guild.id);

	if (timestamp - GCD > 3) {
		await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

		const embed = new MessageEmbed()
			// Set the title of the field
			.setTitle(title)
			// Set the color of the embed
			.setColor(color)
			// Set the main content of the embed
			.setDescription(msg);
		// Send the embed to the same channel as the message
		return await message.channel
			.send(embed)
			.then((sentMsg) => {
				return sentMsg;
			})
			.catch((error) => logger.error(error));
	} else {
		return false;
	}
}

/**
 * Random number between X and Y
 * @param min
 * @param max
 */
export function getRndInteger(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * PHP (Better) Timestamp
 */
export function getCurrentTime(): number {
	return Math.floor(Date.now() / 1000);
}

/**
 * returns POKéMON
 */
export function theWord(): string {
	return 'POKéMON';
}

export function getTimeInterval(datetime: string): string {
	const liveAt = new Date(moment(datetime).format('MM/DD/YYYY, hh:mm:ss A'));
	const timeNow = new Date();

	const diff = datetimeDifference(liveAt, timeNow);

	const string = {
		years: 'year',
		months: 'month',
		weeks: 'week',
		days: 'day',
		hours: 'hour',
		minutes: 'minute',
		seconds: 'second',
		//milliseconds: 'millisecond'
	};

	const finishedString = [];

	Object.keys(string).forEach(function(key) {
		// do something with string[key]
		if (diff[key] > 1) {
			string[key] = diff[key] + ' ' + string[key] + 's';
			finishedString.push(string[key]);
		} else if (diff[key] == 1) {
			string[key] = diff[key] + ' ' + string[key];
			finishedString.push(string[key]);
		} else {
			delete string[key];
		}
	});

	const actuallyFinish = finishedString.join(', ');

	return actuallyFinish;
}

/**
 * Format big numbers with commas.
 * @param num
 */
export function format_number(num: number): string {
	return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}

/**
 * Fetch json from URL.
 * @param {string} url URL String
 */
export const jsonFetch = (url: string): Promise<any> =>
	fetch(url, {
		method: 'GET',
	}).then(async (res) => res.json());

/**
 * Split an array into other arrays.
 * @param arr Array
 * @param len # of Objects Per Array
 */
export function chunk(arr: Array<any>, len: number): Array<any> {
	const chunks = [];
	let i = 0;
	const n = arr.length;

	while (i < n) {
		chunks.push(arr.slice(i, (i += len)));
	}

	return chunks;
}

/**
 * Split string but with a limit.
 * PHP Function
 * @param string
 * @param separator
 * @param limit
 */
export function explode(
	string: string,
	separator: string,
	limit: number,
): Array<string> {
	const array = string.split(separator);
	if (limit !== undefined && array.length >= limit) {
		array.push(array.splice(limit - 1).join(separator));
	}
	return array;
}
