import { Collection, Message } from 'discord.js';
import { FFZEmotes } from '../types/FFZ-Emotes';
import { rateLimited } from './discord';
import { getLogger } from './logger';

const logger = getLogger('Queue');

export const EmoteQueue: Collection<
	string,
	{ emotes: FFZEmotes[]; msg: Message }
> = new Collection();
const COOLDOWN = 30 * 1000;

setTimeout(runEmoteQueue, COOLDOWN);

function runEmoteQueue() {
	if (EmoteQueue.first() && !rateLimited) {
		const object = EmoteQueue.first();
		const emote: FFZEmotes = object.emotes?.shift() ?? null;
		const message = object.msg;

		EmoteQueue.set(message.guild.id, object);

		if (emote) {
			let emote_url = '';

			if (emote.urls['2']) {
				emote_url = 'https:' + emote.urls['2'];
			} else {
				emote_url = 'https:' + emote.urls['4'] ?? emote.urls['1'];
			}

			if (!emote_url.match('undefined')) {
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
			switch (err.message) {
				case 'Maximum number of emojis reached (50)':
				case 'Maximum number of emojis reached (75)':
				case 'Maximum number of emojis reached (100)':
				case 'Maximum number of emojis reached (250)':
					EmoteQueue.delete(message.guild.id);
					logger.info(
						`Maximum emojis reached for server '${message.guild.name}'.`,
					);
					await message.reply(
						`you've reached the maximum amount of emotes for the server.`,
					);
					break;

				case 'Missing Permissions':
					EmoteQueue.delete(message.guild.id);
					logger.info(
						`Improper permissions for server '${message.guild.name}'.`,
					);
					await message.reply(
						`SmokeyBot doesn't have the proper permissions. Make sure SmokeyBot can Manage Emoji in the roles section.`,
					);
					break;

				default:
					logger.error('Emote error:', err);

					break;
			}
		});
}
