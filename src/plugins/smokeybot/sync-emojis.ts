import { Message, MessageEmbed } from 'discord.js';
import Keyv from 'keyv';
import { getLogger } from '../../clients/logger';
import { EmoteQueue } from '../../clients/queue';
import { FFZRoom } from '../../types/FFZ-Emotes';
import { jsonFetch } from '../../utils';

const EMOJI_COOLDOWN = new Keyv({ namespace: 'EMOJI_COOLDOWN' });

const logger = getLogger('Emoji Manager');

/**
 * Cancel the emote sync for the guild.
 * @param message
 */
export async function cancel_sync(message: Message): Promise<boolean> {
	const args = message.content
		.slice(1)
		.trim()
		.replace(/ {2,}/gm, ' ')
		.split(/ +/);
	const command = args.shift().toLowerCase();

	if (
		command == 'cancel-sync' &&
		EmoteQueue.has(message.guild.id) &&
		message.member.hasPermission('ADMINISTRATOR')
	) {
		EmoteQueue.delete(message.guild.id);
		await message.reply(
			'your emote queue has been cancelled.  You can sync again after 20 minutes from the original sync.',
		);
		return true;
	} else {
		return false;
	}
}

/**
 *
 * @param message
 */
export async function sync_ffz_emotes(message: Message): Promise<void> {
	let embed = undefined;
	let to_be_deleted = undefined;
	const cooldown = await EMOJI_COOLDOWN.get(message.guild.id);
	const args = message.content
		.slice(1)
		.trim()
		.toLowerCase()
		.replace(/ {2,}/gm, ' ')
		.split(/ +/);
	const command = args.shift();
	const channel = args[0]?.replace(/\W/g, '');

	if (
		command == 'sync-emotes-ffz' &&
		channel &&
		message.member.hasPermission('ADMINISTRATOR') &&
		!cooldown
	) {
		embed = new MessageEmbed()
			.setTitle('Emoji Manager')
			.setColor(0xff0000)
			.setDescription(`Checking FrankerFaceZ API to sync emotes..`);
		await message.channel
			.send(embed)
			.then((message) => {
				to_be_deleted = message.id;
			})
			.catch((error) => logger.error(error));

		logger.debug(
			`Fetching FFZ Emotes for Twitch channel ${channel} (requested by ${message.member.displayName} in ${message.guild.name})..`,
		);

		const ffz_emotes: FFZRoom = await jsonFetch(
			`https://api.frankerfacez.com/v1/room/${channel}`,
		);

		if (!ffz_emotes || !ffz_emotes.room || !ffz_emotes.room.set) {
			logger.debug(`Couldn't fetch FFZ Emotes for Twitch channel ${channel}.`);

			await message.channel.messages
				.fetch(to_be_deleted)
				.then((message) => {
					message.delete();
				})
				.catch((error) => logger.error(error));

			embed = new MessageEmbed()
				.setTitle('Emoji Manager')
				.setColor(0xff0000)
				.setDescription(
					`There was an error fetching from FrankerFaceZ's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for FFZ's cache to update before getting certain emotes. This can take up to an hour. \n\n You can try this again in 20 minutes.`,
				);
			await message.channel.send(embed);

			return;
		} else if (ffz_emotes.room.set) {
			await EMOJI_COOLDOWN.set(message.guild.id, true, 1200 * 1000);

			const emojis = ffz_emotes.sets[ffz_emotes.room.set].emoticons;

			const existing_emojis = [];

			new Map(message.guild.emojis.cache).forEach((value) => {
				existing_emojis.push(value.name);
			});

			if (!EmoteQueue.has(message.guild.id)) {
				logger.debug(`Syncing ${emojis.length} total emotes for ${channel}..`);

				EmoteQueue.set(message.guild.id, {
					emotes: emojis,
					existing: existing_emojis,
					msg: message,
				});

				await message.channel.messages
					.fetch(to_be_deleted)
					.then((message) => {
						message.delete();
					})
					.catch((error) => logger.error(error));

				embed = new MessageEmbed()
					.setTitle('Emoji Manager')
					.setColor(0x00bc8c)
					.setDescription(
						`**Successfully syncing emotes!** \n\n\n It will take up to 20 minutes or more depending on server load to complete depending how many emotes you have. \n\n\n\n **NOTE:** You can try again after 20 minutes from the original sync. Type \`~cancel-sync\` to cancel.`,
					);
				await message.channel.send(embed);
			} else {
				logger.debug(`Error syncing emotes for ${channel}..`);

				const currentQueue = EmoteQueue.get(message.guild.id);
				const emotes = currentQueue.emotes.length;

				await message.channel.messages
					.fetch(to_be_deleted)
					.then((message) => {
						message.delete();
					})
					.catch((error) => logger.error(error));

				embed = new MessageEmbed()
					.setTitle('Emoji Manager')
					.setColor(0x00bc8c)
					.setDescription(
						`**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`,
					);
				await message.channel.send(embed);
			}
		}
	}
}
