import { Collection, Message } from 'discord.js';
import { getLogger } from './logger';
import { FFZEmotes } from '../types/FFZ-Emotes';

const logger = getLogger('Queue');

export const EmoteQueue: Collection<
	string,
	{ emotes: FFZEmotes[]; existing: string[]; msg: Message }
> = new Collection();
const COOLDOWN = 20 * 1000;

setTimeout(runEmoteQueue, COOLDOWN);

function runEmoteQueue() {
	if (EmoteQueue.first()) {
		const object = EmoteQueue.first();
		const emote: FFZEmotes = object.emotes?.shift();
		const existing = object.existing;
		const message = object.msg;

		if (emote) {
			let emote_url = '';

			if (emote[0].urls['2']) {
				emote_url = 'https:' + emote[0].urls['2'];
			} else {
				emote_url = 'https:' + emote[0].urls['4'];
			}

			if (!existing.includes(emote[0].name)) {
				create_emoji(emote_url, message, emote[0].name);
				setTimeout(runEmoteQueue, COOLDOWN);
			} else {
				setTimeout(runEmoteQueue, COOLDOWN);
			}
		} else {
			EmoteQueue.delete(EmoteQueue.firstKey());
			setTimeout(runEmoteQueue, COOLDOWN);
		}
	} else {
		setTimeout(runEmoteQueue, COOLDOWN);
	}
}

async function create_emoji(
	emote_url: string,
	message: Message,
	name: string,
): Promise<void> {
	await message.guild.emojis
		.create(emote_url, name)
		.then((emoji) => {
			logger.debug(`Created new emoji with name ${emoji.name}!`);
		})
		.catch(async (err) => {
			logger.error('Emote error:', err);
			if (err.message.match(/Maximum number of emojis reached/i)) {
				EmoteQueue.delete(message.guild.id);
				await message.reply(
					`you've reached the maximum amount of emotes for the server.`,
				);
			}
		});
}
