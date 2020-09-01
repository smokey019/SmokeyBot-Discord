import { Collection, Message } from 'discord.js';
import { getLogger } from './logger';

const logger = getLogger('Queue');

export const EmoteQueue: Collection<string, GuildEmoteQueue> = new Collection();
const COOLDOWN = 20 * 1000;

interface GuildEmoteQueue {
	emotes: [[string, Message, string]];
}

setTimeout(runEmoteQueue, COOLDOWN);

function runEmoteQueue() {
	if (EmoteQueue.first()) {
		const guild = EmoteQueue.first();

		if (guild.emotes.length > 0) {
			create_emoji(guild.emotes[0][0], guild.emotes[0][1], guild.emotes[0][2]);
			delete guild.emotes[0];
			setTimeout(runEmoteQueue, COOLDOWN);
		} else {
			EmoteQueue.delete(EmoteQueue.firstKey());
			setTimeout(runEmoteQueue, COOLDOWN);
		}
	}
}

async function create_emoji(
	emote_url: string,
	message: Message,
	name: string,
): Promise<void> {
	message.guild.emojis
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
