import { CommandInteraction, Permissions, PermissionString } from 'discord.js';
import { LRUCache } from 'mnemonist';
import { getLogger } from '../../../clients/logger';
import { EmoteQueue } from '../../../clients/queue';
import { FFZRoom } from '../../../models/FFZ-Emotes';
import { jsonFetch } from '../../../utils';

const logger = getLogger('FFZ Emote Manager');
export const EMOJI_COOLDOWN = new LRUCache<string, number>(25);
export let FFZ_emoji_queue_count = 0;
export let FFZ_emoji_queue_attempt_count = 0;

/**
 * Cancel the emote sync for the guild.
 * @param message
 */
export async function cancel_sync(
  interaction: CommandInteraction,
): Promise<boolean> {
  const inQueue = EmoteQueue.get(interaction.guild.id);
  if (inQueue) {
    EmoteQueue.delete(interaction.guild.id);
    // inQueue.msg.editReply('Sync cancelled.  You can do another if you wish.');
    logger.debug(
      'Sync cancelled by ' +
        interaction.user.username +
        ' in ' +
        interaction.guild.name,
    );
    interaction.reply({ content: '👍', ephemeral: false });
    return true;
  } else {
    return false;
  }
}

/**
 *
 * @param message
 */
export async function sync_ffz_emotes(
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
    await interaction.reply(`Checking FrankerFaceZ API to sync emotes..`);

    logger.debug(
      `Fetching FFZ Emotes for Twitch channel ${channel} (requested by ${interaction.user.username} in ${interaction.guild.name})..`,
    );

    const ffz_emotes: FFZRoom = await jsonFetch(
      `https://api.frankerfacez.com/v1/room/${channel}`,
    );
    FFZ_emoji_queue_attempt_count++;

    if (!ffz_emotes || !ffz_emotes.room || !ffz_emotes.room.set) {
      logger.debug(`Couldn't fetch FFZ Emotes for Twitch channel ${channel}.`);

      await interaction.editReply(
        `There was an error fetching from FrankerFaceZ's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for FFZ's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`/sync-ffz summit1g\``,
      );

      return;
    } else if (ffz_emotes.room.set) {
      const emojis = ffz_emotes.sets[ffz_emotes.room.set].emoticons;

      const existing_emojis = [];

      const final_emojis = [];

      interaction.guild.emojis.cache.forEach((value) => {
        existing_emojis.push(value.name);
      });

      if (!EmoteQueue.has(interaction.guild.id)) {
        emojis.forEach((element) => {
          const emote_url =
            ('https://' + element.urls['4']?.replace("https:/", "") ||
              'https://' + element.urls['3']?.replace("https:/", "") ||
              'https://' + element.urls['2']?.replace("https:/", "") ||
              'https://' + element.urls['1']?.replace("https:/", "")) ??
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
          EMOJI_COOLDOWN.set(interaction.guild.id, Date.now());

          logger.debug(
            `Syncing ${final_emojis.length}/${emojis.length} total emotes for ${channel}..`,
          );

          FFZ_emoji_queue_count++;

          EmoteQueue.set(interaction.guild.id, {
            emotes: final_emojis,
            msg: interaction,
          });

          await interaction.editReply(
            `**Successfully syncing ${final_emojis.length}/${emojis.length} emotes!** \n\n\n It will take up to 30 minutes or more depending on the queue. \n\n Type \`/cancel-sync\` to cancel. \n Type \`/stats\` to see how many servers are in queue.`,
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
