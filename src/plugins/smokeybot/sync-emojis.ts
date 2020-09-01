import { MessageEmbed, Message } from 'discord.js';
import { jsonFetch, getCurrentTime } from '../../utils';
import { getLogger } from '../../clients/logger';
import { getGCD, GLOBAL_COOLDOWN } from '../../clients/cache';
import Keyv from 'keyv';
import { getConfigValue } from '../../config';

const EMOJI_COOLDOWN = new Keyv(
	`mysql://${getConfigValue('DB_USER')}:${getConfigValue(
		'DB_PASSWORD',
	)}@${getConfigValue('DB_HOST')}:3306/${getConfigValue('DB_DATABASE')}`,
	{ keySize: 191, namespace: 'EMOJI_COOLDOWN' },
);

export interface IFFZRoom {
	room?: {
		_id: number;
		css: null;
		display_name: string;
		id: string;
		is_group: boolean;
		moderator_badge: null;
		set: number;
		twitch_id: number;
	};
	sets?: unknown;
}

const logger = getLogger('SmokeyBot-Emojis');

/**
 *
 * @param message
 */
export async function sync_ffz_emotes(message: Message): Promise<void> {
	let embed = undefined;
	let to_be_deleted = undefined;
	const cooldown = await EMOJI_COOLDOWN.get(message.guild.id);

	if (
		message.content.match(/~sync-emotes-ffz/i) &&
		message.member.hasPermission('ADMINISTRATOR') &&
		!cooldown
	) {
		embed = new MessageEmbed()
			// Set the title of the field
			.setTitle('Emoji Manager')
			// Set the color of the embed
			.setColor(0xff0000)
			// Set the main content of the embed
			.setDescription(`Checking FrankerFaceZ API to sync emotes..`);
		// Send the embed to the same channel as the message
		await message.channel
			.send(embed)
			.then((message) => {
				to_be_deleted = message.id;
			})
			.catch(console.error);

		const existing_emojis = [];

		const split_msg = message.content.split(' ');

		if (split_msg.length != 2) {
			return;
		}

		let emojis = undefined;

		split_msg[1] = split_msg[1].toLowerCase().replace(/\W/g, '');

		logger.log(
			`fetching FFZ Emotes for Twitch channel ${split_msg[1]} (requested by ${message.member.displayName} in ${message.guild.name})..`,
		);

		// emojis.smokEmotes = await jsonFetch(`https://bot.smokey.gg/api/emotes/?channel_id=${split_msg[1]}`);

		const ffz_emotes: IFFZRoom = await jsonFetch(
			`https://api.frankerfacez.com/v1/room/${split_msg[1].toLowerCase()}`,
		);

		if (!ffz_emotes || !ffz_emotes.room || !ffz_emotes.room.set) {
			message.channel.messages
				.fetch(to_be_deleted)
				.then((message) => {
					message.delete();
				})
				.catch(console.error);

			embed = new MessageEmbed()
				// Set the title of the field
				.setTitle('Emoji Manager')
				// Set the color of the embed
				.setColor(0xff0000)
				// Set the main content of the embed
				.setDescription(
					`There was an error fetching from FrankerFaceZ's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for FFZ's cache to update before getting certain emotes.`,
				);
			// Send the embed to the same channel as the message
			message.channel.send(embed);

			return;
		}

		if (ffz_emotes.room.set) {
			await EMOJI_COOLDOWN.set(message.guild.id, true, 1200 * 1000);
			const set_number = ffz_emotes.room.set;
			let emote_cooldown = 15 * 1000;

			emojis = ffz_emotes.sets[set_number].emoticons;

			new Map(message.guild.emojis.cache).forEach((value) => {
				existing_emojis.push(value.name);
			});

			emojis.forEach(
				(value: { urls: { [x: string]: string }; name: string }) => {
					let emote_url = '';

					if (value.urls['2']) {
						emote_url = 'https:' + value.urls['2'];
					} else {
						emote_url = 'https:' + value.urls['4'];
					}

					if (emote_url.match(/frankerfacez/i)) {
						if (!existing_emojis.includes(value.name)) {
							setTimeout(
								create_emoji,
								emote_cooldown,
								emote_url,
								message,
								value,
							);

							emote_cooldown = emote_cooldown + 15 * 1000;
						}
					}
				},
			);
		}

		if (ffz_emotes) {
			message.channel.messages
				.fetch(to_be_deleted)
				.then((message) => {
					message.delete();
				})
				.catch(console.error);

			embed = new MessageEmbed()
				// Set the title of the field
				.setTitle('Emoji Manager')
				// Set the color of the embed
				.setColor(0x00bc8c)
				// Set the main content of the embed
				.setDescription(
					`**Successfully synced emotes!** \n\n It will take awhile for the emojis to show up. \n\n **NOTE:** You can only do this once a day.`,
				);
			// Send the embed to the same channel as the message
			message.channel.send(embed);
		}
	}
}

/**
 *
 * @param message
 */
export async function sync_smokemotes(message: Message): Promise<void> {
	let embed = undefined;
	let to_be_deleted = undefined;

	if (message.member.hasPermission('ADMINISTRATOR')) {
		embed = new MessageEmbed()
			// Set the title of the field
			.setTitle('Emoji Manager')
			// Set the color of the embed
			.setColor(0xff0000)
			// Set the main content of the embed
			.setDescription(`Checking smokEmotes API to sync emotes..`);
		// Send the embed to the same channel as the message
		await message.channel
			.send(embed)
			.then((message) => {
				to_be_deleted = message.id;
			})
			.catch(console.error);

		const existing_emojis = [];

		const split_msg = message.content.split(' ');

		if (split_msg.length < 2) {
			return;
		}

		let emojis = undefined;

		split_msg[1] = split_msg[1].toLowerCase().replace(/\W/g, '');

		split_msg[2] = split_msg[2].toLowerCase();

		if (split_msg[1] == 'global' && split_msg[2] == 'static') {
			logger.info(
				`fetching Global Static smokEmotes (requested by ${message.member.displayName} in ${message.guild.name})..`,
			);

			emojis = await jsonFetch(
				`https://bot.smokey.gg/api/emotes/?channel_name=global&type=static`,
			);
		} else if (split_msg[1] == 'global' && split_msg[2] == 'gif') {
			logger.info(
				`fetching Global Static smokEmotes (requested by ${message.member.displayName} in ${message.guild.name})..`,
			);

			emojis = await jsonFetch(
				`https://bot.smokey.gg/api/emotes/?channel_name=global&type=gif`,
			);
		}

		if (!emojis.smokEmotes) {
			message.channel.messages
				.fetch(to_be_deleted)
				.then((message) => {
					message.delete();
				})
				.catch(console.error);

			embed = new MessageEmbed()
				// Set the title of the field
				.setTitle('Emoji Manager')
				// Set the color of the embed
				.setColor(0xff0000)
				// Set the main content of the embed
				.setDescription(`There was an error fetching from smokEmotes's API.`);
			// Send the embed to the same channel as the message
			message.channel.send(embed);

			return;
		} else {
			new Map(message.guild.emojis.cache).forEach((value) => {
				existing_emojis.push(value.name);
			});

			let emote_cooldown = 1000;

			emojis.smokEmotes.forEach((value) => {
				const emote_url = value.images['2x'];

				if (!existing_emojis.includes(value.code) && value.width <= 128) {
					setTimeout(create_emoji, emote_cooldown, emote_url, message, value);

					emote_cooldown = emote_cooldown + 4000;
				}
			});

			if (emojis.smokEmotes) {
				message.channel.messages
					.fetch(to_be_deleted)
					.then((message) => {
						message.delete();
					})
					.catch(console.error);

				embed = new MessageEmbed()
					// Set the title of the field
					.setTitle('Emoji Manager')
					// Set the color of the embed
					.setColor(0x00bc8c)
					// Set the main content of the embed
					.setDescription(
						`**Successfully synced emotes!** \n\n It may take a minute or two for all of emojis to show up. \n\n **NOTE:** Wide emotes won't show up properly in Discord and are not uploaded.`,
					);
				// Send the embed to the same channel as the message
				message.channel.send(embed);
			}
		}
	}
}

/**
 * Send Message on Discord
 * @param title
 * @param msg
 * @param message
 * @param color
 */
async function send_message(
	title: string,
	msg: string,
	message: Message,
	color = 0xff0000,
): Promise<Message | boolean> {
	if (!title || !msg || !message) return false;

	const timestamp = getCurrentTime();
	const GCD = await getGCD(message.guild.id);

	if (timestamp - GCD > 5) {
		await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

		const embed = new MessageEmbed()
			// Set the title of the field
			.setTitle(title)
			// Set the color of the embed
			.setColor(color)
			// Set the main content of the embed
			.setDescription(msg);
		// Send the embed to the same channel as the message
		await message.channel
			.send(embed)
			.then((sentMsg) => {
				return sentMsg;
			})
			.catch(console.error);
	}

	return false;
}

/**
 * Create emoji in a Discord Guild
 * @param emote_url
 * @param message
 * @param value
 */
async function create_emoji(
	emote_url: string,
	message: Message,
	value: { code: string; name: string },
): Promise<void> {
	const name = value.code || value.name;

	message.guild.emojis
		.create(emote_url, name)
		.then((emoji) => {
			logger.debug(`Created new emoji with name ${emoji.name}!`);
		})
		.catch((err) => {
			logger.error('Emote error:', err);
			if (err.message.match(/Maximum number of emojis reached/i)) {
				send_message(
					'Error',
					'Maximum emotes reached. Make room and try again.',
					message,
				);
			}
		});
}
