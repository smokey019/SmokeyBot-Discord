import { CommandInteraction } from 'discord.js';
import { getLogger } from 'log4js';
import type { SevenTVChannel, SevenTVChannelEmotes, SevenTVEmotes } from '../../../models/7tv-Emotes';
import { jsonFetch } from '../../../utils';
import { EmoteQueue } from '../../emote_queue';
import { getIDwithUser } from '../../twitch';
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
    'https://7tv.io/v3/emote-sets/global',
  );
  // 7tv.io/v3/emote-sets/global

  return emotes;
}

/**
 * Fetch 7TV Channel Emotes
 * @param channel Twitch Login
 * @returns Array of 7TV Channel Emotes.
 */
export async function fetch7tvChannelEmotes(
  channel: string,
): Promise<SevenTVChannel[]> {
  const emotes: SevenTVChannel[] = await jsonFetch(
    `https://7tv.io/v3/users/twitch/${channel}`,
  );
  Stv_emoji_queue_attempt_count++;
  // 7tv.io/users/{connection.platform}/{connection.id}

  return emotes;
}

async function errorAPI(interaction: CommandInteraction): Promise<any>{
  return await interaction.editReply(
    `There was an error fetching from 7TV's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for 7TV's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`/sync-7tv summit1g\``,
  );
}

/**
 *
 * @param message
 */
export async function sync_7tv_emotes(
  interaction: CommandInteraction,
): Promise<void> {

  const channel = await getIDwithUser(interaction.options.getString('channel'));

  if (
    channel &&
    !EmoteQueue.has(interaction.guild.id)
  ) {
    await interaction.reply(`Checking 7TV API to sync emotes..`);

    logger.debug(
      `Fetching 7TV Emotes for Twitch channel ${channel} (requested by ${interaction.user.username} in ${interaction.guild.name})..`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let emotes: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;

    if (channel == 'global') {
      response = await fetch7tvGlobalEmotes();
      if (!response) return errorAPI(interaction);
      emotes = response?.emotes;
    } else {
      response = await fetch7tvChannelEmotes(channel as string);
      if (!response) return errorAPI(interaction);
      emotes = response?.emote_set?.emotes;
    }

    if (!response || response.status === 404) {
      logger.debug(`Couldn't fetch 7TV Emotes for Twitch channel ${channel}.`);

      return errorAPI(interaction);
    } else {
      const existing_emojis = [];

      const final_emojis = [];

      interaction.guild.emojis.cache.forEach((value) => {
        existing_emojis.push(value.name);
      });

      if (!EmoteQueue.has(interaction.guild.id)) {
        emotes.forEach((element: SevenTVChannelEmotes) => {
          let emote_url =
            ('https:' + element.data.host.url + '/2x.png') ??
            undefined;

          if (element.data.animated) {
            emote_url = 'https:' + element.data.host.url + '/2x.gif';
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
