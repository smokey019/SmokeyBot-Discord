import { Collection, Message } from 'discord.js';
import { FFZEmotes } from '../types/FFZ-Emotes';
import { rateLimited } from './discord';
import { getLogger } from './logger';

const logger = getLogger('Queue');

export const EmoteQueue: Collection<
	string,
	{ emotes: FFZEmotes[]; existing: string[]; msg: Message }
> = new Collection();
const COOLDOWN = 20 * 1000;

setTimeout(runEmoteQueue, COOLDOWN);

function runEmoteQueue() {
	if (EmoteQueue.first() && !rateLimited) {
		const object = EmoteQueue.first();
		const emote: FFZEmotes = object.emotes?.shift() ?? null;
		const existing = object.existing;
		const message = object.msg;

		EmoteQueue.set(message.guild.id, object);

		if (emote) {
			let emote_url = '';

			if (emote.urls['2']) {
				emote_url = 'https:' + emote.urls['2'];
			} else {
				emote_url = 'https:' + emote.urls['4'] ?? emote.urls['1'];
			}

			if (!existing.includes(emote.name) && !emote_url.match('undefined')) {
				logger.trace(
					`Attempting to create emoji '${emote.name}' on ${message.guild.name}.`,
				);
				create_emoji(emote_url, message, emote.name);
				setTimeout(runEmoteQueue, COOLDOWN);
			} else {
				setTimeout(runEmoteQueue, COOLDOWN);
			}

			if (object.emotes.length == 0) {
				const temp = EmoteQueue.first();
				logger.debug(`Successfully finished queue for ${temp.msg.guild.name}.`);
				EmoteQueue.delete(EmoteQueue.firstKey());
			}
		} else {
			const temp = EmoteQueue.first();
			logger.debug(`Successfully finished queue for ${temp.msg.guild.name}.`);
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
		.then(async (emoji) => {
			logger.debug(
				`Created new emoji with name ${emoji.name} in ${emoji.guild.name}.`,
			);
			return true;
		})
		.catch(async (err) => {
			logger.error('Emote error:', err);
			if (err.message.match(/Maximum number of emojis reached/i)) {
				EmoteQueue.delete(message.guild.id);
				await message.reply(
					`you've reached the maximum amount of emotes for the server.`,
				);
			}
			return false;
		});
}
