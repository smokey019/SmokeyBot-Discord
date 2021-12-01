import { Message, MessageEmbed, Permissions } from 'discord.js';
import { getLogger } from 'log4js';
import { EmoteQueue } from '../../../clients/queue';
import { SevenTVEmotes } from '../../../models/7tv-Emotes';
import { jsonFetch } from '../../../utils';
import { EMOJI_COOLDOWN } from './sync-ffz-emotes';

const logger = getLogger('7TV Emote Manager');
export let Stv_emoji_queue_count = 0;
export let Stv_emoji_queue_attempt_count = 0;

/**
 * Fetch 7TV Global Emotes
 * @returns Array of 7TV Global Emotes.
 */
export async function fetch7tvGlobalEmotes(): Promise<SevenTVEmotes[]> {
  const emotes: SevenTVEmotes[] = await jsonFetch(
    'https://api.7tv.app/v2/emotes/global',
  );

  return emotes;
}

/**
 * Fetch 7TV Channel Emotes
 * @param channel Twitch Login
 * @returns Array of 7TV Channel Emotes.
 */
export async function fetch7tvChannelEmotes(
  channel: string,
): Promise<SevenTVEmotes[]> {
  const emotes: SevenTVEmotes[] = await jsonFetch(
    `https://api.7tv.app/v2/users/${channel}/emotes`,
  );
  Stv_emoji_queue_attempt_count++;

  return emotes;
}

/**
 *
 * @param message
 */
export async function sync_7tv_emotes(message: Message, channel: string): Promise<void> {
  let embed = undefined;
  let to_be_deleted = undefined;

  if (
    channel &&
    message.member.permissions.has([
      Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS,
    ]) &&
    !EmoteQueue.has(message.guild.id)
  ) {
    embed = new MessageEmbed()
      .setTitle('7TV Emote Manager')
      .setColor(0xff0000)
      .setDescription(`Checking 7TV API to sync emotes..`);
    await message.channel
      .send({ embeds: [embed] })
      .then((message) => {
        to_be_deleted = message.id;
      })
      .catch((error) => logger.error(error));

    logger.debug(
      `Fetching 7TV Emotes for Twitch channel ${channel} (requested by ${message.member.displayName} in ${message.guild.name})..`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let emotes: any;

    if (channel == 'global') {
      emotes = await fetch7tvGlobalEmotes();
    } else {
      emotes = await fetch7tvChannelEmotes(channel);
    }

    if (!emotes || emotes.status === 404) {
      logger.debug(`Couldn't fetch 7TV Emotes for Twitch channel ${channel}.`);

      await message.channel.messages
        .fetch(to_be_deleted)
        .then((message) => {
          message.delete();
        })
        .catch((error) => logger.error(error));

      embed = new MessageEmbed()
        .setTitle('7TV Emote Manager')
        .setColor(0xff0000)
        .setDescription(
          `There was an error fetching from 7TV's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for 7TV's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`~sync-emotes-7tv summit1g\``,
        );
      await message.channel.send({ embeds: [embed] });

      return;
    } else {
      const existing_emojis = [];

      const final_emojis = [];

      message.guild.emojis.cache.forEach((value) => {
        existing_emojis.push(value.name);
      });

      if (!EmoteQueue.has(message.guild.id)) {
        emotes.forEach((element: SevenTVEmotes) => {
          if (element.mime === "image/webp") return;
          let emote_url =
            (element.urls['4'] ||
              element.urls['3'] ||
              element.urls['2'] ||
              element.urls['1']) ??
            undefined;

          if (element.mime.match('gif')) {
            emote_url = element.urls['2'];
          }

          if (!existing_emojis.includes(element.name) && emote_url[1]) {
            final_emojis.push({ url: emote_url[1], name: element.name });
          } else {
            logger.trace('emote already detected, not uploading..');
          }
        });

        if (final_emojis.length > 0) {
          EMOJI_COOLDOWN.set(message.guild.id, Date.now());

          logger.debug(
            `Syncing ${final_emojis.length}/${emotes.length} total emotes for ${channel}..`,
          );

          Stv_emoji_queue_count++;

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
            .setTitle('7TV Emote Manager')
            .setColor(0x00bc8c)
            .setDescription(
              `**Successfully syncing ${final_emojis.length}/${emotes.length} emotes!**\n\n\nIt will take up to 30 minutes or more depending on the queue.\n\n- Discord's maximum GIF size is 256 kb so some longer emotes may not get uploaded. \n- Some images may not upload because 7TV has converted them to \`image/webp\` instead of GIFs so Discord does not accept it.\n- Only images marked as \`image/gif\` or \`image/png\` in their API will be uploaded.\n\n Type \`~cancel-sync\` to cancel. \n Type \`~stats\` to see how many servers are in queue.`,
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
            .setTitle('7TV Emote Manager')
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
          .setTitle('7TV Emote Manager')
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
      .setTitle('7TV Emote Manager')
      .setColor(0x00bc8c)
      .setDescription(
        `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`,
      );
    await message.channel.send({ embeds: [embed] });
  }
}
