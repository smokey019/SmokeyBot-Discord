import { CommandInteraction, Permissions, PermissionString } from 'discord.js';
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
export async function sync_7tv_emotes(
  interaction: CommandInteraction,
): Promise<void> {
  const channel = interaction.options.getString('channel').toLowerCase().trim();

  const userPerms = new Permissions(
    interaction.member.permissions as PermissionString,
  );

  if (
    channel &&
    userPerms.has(Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS) &&
    !EmoteQueue.has(interaction.guild.id)
  ) {
    await interaction.reply(`Checking 7TV API to sync emotes..`);

    logger.debug(
      `Fetching 7TV Emotes for Twitch channel ${channel} (requested by ${interaction.user.username} in ${interaction.guild.name})..`,
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

      await interaction.editReply(
        `There was an error fetching from 7TV's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for 7TV's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`/sync-7tv summit1g\``,
      );

      return;
    } else {
      const existing_emojis = [];

      const final_emojis = [];

      interaction.guild.emojis.cache.forEach((value) => {
        existing_emojis.push(value.name);
      });

      if (!EmoteQueue.has(interaction.guild.id)) {
        emotes.forEach((element: SevenTVEmotes) => {
          /*if (element.mime === 'image/webp' || element.mime.match('gif'))
            return;*/
          let emote_url =
            // element.urls['4'] ||
            (element.urls['3'][1] || element.urls['2'][1] || element.urls['1'][1]) ??
            undefined;

          if (element.mime.match('image/webp') && element.urls['2']) {
            emote_url = element.urls['1'][1].replace('webp', 'gif');
          }

          if (!existing_emojis.includes(element.name) && emote_url) {
            final_emojis.push({ url: emote_url, name: element.name });
          } else {
            logger.trace('emote already detected, not uploading..');
          }
        });

        if (final_emojis.length > 0) {
          EMOJI_COOLDOWN.set(interaction.guild.id, Date.now());

          logger.debug(
            `Syncing ${final_emojis.length}/${emotes.length} total emotes for ${channel}..`,
          );

          Stv_emoji_queue_count++;

          EmoteQueue.set(interaction.guild.id, {
            emotes: final_emojis,
            msg: interaction,
          });

          await interaction.editReply(
            `**Successfully syncing ${final_emojis.length}/${emotes.length} emotes!**\n\n\nIt will take up to 30 minutes or more depending on the queue.\n\n- Wide emotes will look weird.\n- Certain GIFs that are too long may not upload.\n\n Type \`/cancel-sync\` to cancel. \n Type \`/stats\` to see how many servers are in queue.`,
          );
        } else {
          logger.debug(`No emotes found able to be synced for ${channel}..`);
          await interaction.editReply(
            `No emotes found to sync. If the emote name(s) already exist they will not be overridden.`,
          );
        }
      } else {
        logger.debug(`Error syncing emotes for ${channel}..`);

        const currentQueue = EmoteQueue.get(interaction.guild.id);
        const emotes = currentQueue.emotes.length;

        await interaction.editReply(
          `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`,
        );
      }
    }
  } else if (EmoteQueue.has(interaction.guild.id)) {
    logger.debug(
      `Error syncing emotes for ${channel}.. They are already in queue.`,
    );

    const currentQueue = EmoteQueue.get(interaction.guild.id);
    const emotes = currentQueue.emotes.length;

    await interaction.editReply(
      `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`,
    );
  }
}
