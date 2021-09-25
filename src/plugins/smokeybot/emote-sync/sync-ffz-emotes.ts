import { Message, MessageEmbed, Permissions } from 'discord.js';
import { LRUCache } from 'mnemonist';
import { getLogger } from '../../../clients/logger';
import { EmoteQueue } from '../../../clients/queue';
import { FFZRoom } from '../../../models/FFZ-Emotes';
import { jsonFetch } from '../../../utils';

const logger = getLogger('FFZ Emote Manager');
export const EMOJI_COOLDOWN = new LRUCache<string, number>(25);

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
    message.member.permissions.has([
      Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS,
    ])
  ) {
    EmoteQueue.delete(message.guild.id);
    await message.reply(
      'Your emote queue has been cancelled.  You can sync again if you wish.',
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
    message.member.permissions.has([
      Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS,
    ]) &&
    !EmoteQueue.has(message.guild.id)
  ) {
    embed = new MessageEmbed()
      .setTitle('FrankerFaceZ Emote Manager')
      .setColor(0xff0000)
      .setDescription(`Checking FrankerFaceZ API to sync emotes..`);
    await message.channel
      .send({ embeds: [embed] })
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
        .setTitle('FrankerFaceZ Emote Manager')
        .setColor(0xff0000)
        .setDescription(
          `There was an error fetching from FrankerFaceZ's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for FFZ's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`~sync-emotes-ffz summit1g\``,
        );
      await message.channel.send({ embeds: [embed] });

      return;
    } else if (ffz_emotes.room.set) {
      const emojis = ffz_emotes.sets[ffz_emotes.room.set].emoticons;

      const existing_emojis = [];

      const final_emojis = [];

      message.guild.emojis.cache.forEach((value) => {
        existing_emojis.push(value.name);
      });

      if (!EmoteQueue.has(message.guild.id)) {
        emojis.forEach((element) => {
          const emote_url =
            ('https:' + element.urls['4'] ||
              'https:' + element.urls['3'] ||
              'https:' + element.urls['2'] ||
              'https:' + element.urls['1']) ??
            undefined;

          if (
            !existing_emojis.includes(element.name) &&
            !emote_url.match('undefined') &&
            emote_url
          ) {
            final_emojis.push({ url: emote_url, name: element.name });
          } else {
            logger.trace('emote already detected, not uploading..');
          }
        });

        if (final_emojis.length > 0) {
          EMOJI_COOLDOWN.set(message.guild.id, Date.now());

          logger.debug(
            `Syncing ${final_emojis.length}/${emojis.length} total emotes for ${channel}..`,
          );

          EmoteQueue.set(message.guild.id, {
            emotes: final_emojis,
            msg: message,
          });

          await message.channel.messages
            .fetch(to_be_deleted)
            .then((message) => {
              message.delete();
            })
            .catch((error) => logger.error(error));

          embed = new MessageEmbed()
            .setTitle('FrankerFaceZ Emote Manager')
            .setColor(0x00bc8c)
            .setDescription(
              `**Successfully syncing ${final_emojis.length}/${emojis.length} emotes!** \n\n\n It will take up to 30 minutes or more depending on the queue. \n\n Type \`~cancel-sync\` to cancel. \n Type \`~stats\` to see how many servers are in queue.`,
            );
          await message.channel.send({ embeds: [embed] });
        } else {
          logger.debug(`No emotes found able to be synced for ${channel}..`);
          await message.channel.messages
            .fetch(to_be_deleted)
            .then((message) => {
              message.delete();
            })
            .catch((error) => logger.error(error));

          embed = new MessageEmbed()
            .setTitle('FrankerFaceZ Emote Manager')
            .setColor(0x00bc8c)
            .setDescription(
              `No emotes found to sync. If the emote name(s) already exist they will not be overridden.`,
            );
          await message.channel.send({ embeds: [embed] });
        }
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
          .setTitle('FrankerFaceZ Emote Manager')
          .setColor(0x00bc8c)
          .setDescription(
            `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`,
          );
        await message.channel.send({ embeds: [embed] });
      }
    }
  } else if (EmoteQueue.has(message.guild.id)) {
    logger.debug(
      `Error syncing emotes for ${channel}.. They are already in queue.`,
    );

    const currentQueue = EmoteQueue.get(message.guild.id);
    const emotes = currentQueue.emotes.length;

    embed = new MessageEmbed()
      .setTitle('FrankerFaceZ Emote Manager')
      .setColor(0x00bc8c)
      .setDescription(
        `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`,
      );
    await message.channel.send({ embeds: [embed] });
  }
}
