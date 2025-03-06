import { Collection, CommandInteraction } from "discord.js";
import Queue from "queue";
import type {
  SevenTVChannel,
  SevenTVChannelEmotes,
  SevenTVEmotes,
} from "../../models/7tv-Emotes";
import type { FFZRoom } from "../../models/FFZ-Emotes";
import { jsonFetch } from "../../utils";
import { getLogger } from "../logger";
import { getIDwithUser } from "../twitch";

export const q = new Queue({ results: [] });
q.autostart = true;
q.concurrency = 1;

q.addEventListener("timeout", (e) => {
  console.log("job timed out:", e.detail.job.toString().replace(/\n/g, ""));
  e.detail.next();
});

const logger = getLogger("Emote Queue");
export let queue_attempts = 0;
export let queue_add_success = 0;

let timer: Timer;

export const EmoteQueue: Collection<
  string,
  {
    emotes: Collection<string, string>;
    successes: number;
    failures: number;
    removed: number;
    interaction: CommandInteraction;
  }
> = new Collection();

/**
 * Fetch 7TV Global Emotes
 * @returns Array of 7TV Global Emotes.
 */
export async function fetch7tvGlobalEmotes(): Promise<SevenTVEmotes[]> {
  const emotes: SevenTVEmotes[] = await jsonFetch(
    "https://7tv.io/v3/emote-sets/global"
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
  channel: string
): Promise<SevenTVChannel[]> {
  const emotes: SevenTVChannel[] = await jsonFetch(
    `https://7tv.io/v3/users/twitch/${channel}`
  );
  queue_attempts++;
  // 7tv.io/users/{connection.platform}/{connection.id}

  return emotes;
}

/**
 * Reset emote timer. Admin only.
 * @param interaction
 */
export async function ResetEmoteTimer(
  interaction: CommandInteraction
): Promise<any> {
  if (timer) {
    clearInterval(timer);
    timer = setInterval(ReadQueue, 1500);
    if (timer) {
      interaction.editReply("Restarted timer.");
    }
  } else {
    interaction.editReply("No timer exists");
  }
}

/**
 * Start emote timer if one doesn't exist. Admin only.
 * @param interaction
 */
export async function StartEmoteTimer(
  interaction: CommandInteraction
): Promise<any> {
  if (timer) {
    interaction.editReply("Timer already exists.");
  } else {
    timer = setInterval(ReadQueue, 1500);
    interaction.editReply("Started a timer. ID: " + timer);
  }
}

async function errorAPI(interaction: CommandInteraction): Promise<any> {
  return await interaction.editReply(
    `There was an error fetching from 7TV's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for 7TV's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`/sync-7tv summit1g\``
  );
}

/**
 * Remove a particular emote from the queue.
 * @param guild_id
 * @param emote
 * @param interaction
 */
export async function RemoveEmote(
  interaction: CommandInteraction
): Promise<void> {
  const emote = await interaction.options.getString("emote");
  if (!emote) {
    await interaction.editReply("You must enter an emote.");
    return;
  }
  if (EmoteQueue.has(interaction.guild.id)) {
    const data = EmoteQueue.get(interaction.guild.id);
    if (data.emotes.has(emote)) {
      if (data.emotes.delete(emote)) {
        await interaction.editReply(
          `Successfully removed \`${emote}\` from the queue.`
        );
      } else {
        await interaction.editReply(
          `There was an error deleting \`${emote}\` from the queue.`
        );
      }
    } else {
      await interaction.editReply(
        `The emote \`${emote}\` doesn't exist in the queue.  This is case sensitive.`
      );
    }
  } else {
    await interaction.editReply(`Brother, you are not in the queue.`);
  }
}

/**
 * Check the emote queue for uploads.
 */
async function ReadQueue() {
  // check if there's anything to do

  if (EmoteQueue.size > 0) {
    // grab first guild's data

    const data = EmoteQueue.get(EmoteQueue.firstKey());

    // check if there's any emotes to upload, this shouldn't happen but just in case

    if (data.emotes.size > 0) {
      const emote = data.emotes.firstKey();
      const url = data.emotes.first();

      // create emote, handles error messages over there

      const create = await create_emoji(url, emote, data);
      data.emotes.delete(emote);

      // check if we created the emote successfully

      if (create) {
        data.successes++;
      } else {
        // make sure we still exist because we can get removed if emote slots are full
        if (EmoteQueue.has(data.interaction.guild.id)) {
          data.failures++;
        }
      }

      // are we done?

      if (data.emotes.size === 0) {
        await data.interaction.editReply(
          `Finished the emote queue! \n\n Successful: ${data.successes} \n Failures: ${data.failures} \n Removed (by you or detected as existing): ${data.removed}`
        );

        // delete from guild from queue

        EmoteQueue.delete(data.interaction.guild.id);

        // clear timer if we don't have anymore to upload

        if (EmoteQueue.size === 0) {
          clearInterval(timer);
          timer = undefined;
        }
      }
    }
  } else {
    // Nothing in the queue. Clear timer.
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }
}

/**
 * Function to create an emoji in a Discord server.
 * @param emote_url Emote URL (256kb limit)
 * @param name String
 * @param data emote queue data
 * @returns true/false
 */
async function create_emoji(
  emote_url: string,
  name: string,
  data: {
    emotes: Collection<string, string>;
    successes: number;
    failures: number;
    removed: number;
    interaction: CommandInteraction;
  },
  SmallerImage?: string
): Promise<boolean> {
  if (!data.interaction.guild || !EmoteQueue.has(data.interaction.guild.id))
    return false;

  logger.trace(
    `Creating new emoji with name ${name} in ${data.interaction.guild.name}...`
  );

  try {
    if (
      await data.interaction.guild.emojis
        .create({ attachment: emote_url, name: name })
        .then(async (emoji) => {
          logger.debug(
            `Created new emoji with name ${emoji.name} in ${emoji.guild.name}.`
          );

          await data.interaction.editReply(
            `Successfully uploaded emote \`${emoji.name}\`.`
          );

          return true;
        })
    ) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    if (err.message.match("Failed to resize asset")) {
      logger.debug(`'${name}' is too big, will try to upload 1x.`);
      await data.interaction.editReply(
        `'${name}' is too big, We recommend going to the URL of the emote, linking it in a Discord chat then clicking Favorite on the emote. \n\n URL (2x): ${emote_url}`
      );

      return false;
    } else if (err.message.match("Maximum number")) {
      logger.debug(
        `Maximum number of emotes reached in ${data.interaction.guild.name}.`
      );

      await data.interaction.editReply(
        `You've reached the maximum amount of emotes for the server.  Make sure you have enough animated AND standard emote slots.  Either one being full will prevent the bot from uploading emotes.`
      );
      EmoteQueue.delete(data.interaction.guild.id);

      return false;
    } else if (err.message.match("Missing Permissions")) {
      logger.debug(`Missing Permissions in ${data.interaction.guild.name}.`);
      await data.interaction.editReply(
        `SmokeyBot doesn't have the proper permissions. Make sure SmokeyBot can Manage Emoji in the roles section.`
      );
      EmoteQueue.delete(data.interaction.guild.id);

      return false;
    } else {
      logger.error(err);

      return false;
    }
  }
}

/**
 * 7tv portion
 */

/**
 * Sync 7tv emotes
 * @param interaction
 * @returns
 */
export async function sync_7tv_emotes(
  interaction: CommandInteraction
): Promise<void> {
  const channel = await getIDwithUser(interaction.options.getString("channel"));

  if (channel && !EmoteQueue.has(interaction.guild.id)) {
    await interaction.editReply(`Checking 7TV API to sync emotes..`);

    logger.debug(
      `Fetching 7TV Emotes for Twitch channel ${channel} (requested by ${interaction.user.username} in ${interaction.guild.name})..`
    );

    let emotes: any;
    let response: any;

    if (channel == "global") {
      response = await fetch7tvGlobalEmotes();
      if (!response) return await errorAPI(interaction);
      emotes = response?.emotes;
    } else {
      response = await fetch7tvChannelEmotes(channel as string);
      if (!response) return await errorAPI(interaction);
      emotes = response?.emote_set?.emotes;
    }

    if (!response || response.status === 404) {
      logger.debug(`Couldn't fetch 7TV Emotes for Twitch channel ${channel}.`);

      return await errorAPI(interaction);
    } else {
      const existing_emojis = [];

      const final_emojis: Collection<string, string> = new Collection();

      let detectedemotes = 0;

      interaction.guild.emojis.cache.forEach((value) => {
        existing_emojis.push(value.name);
      });

      if (!EmoteQueue.has(interaction.guild.id)) {
        emotes?.forEach((element: SevenTVChannelEmotes) => {
          element.name = element.name.replace(/\W/gm, "");
          let emote_url = "https:" + element.data.host.url + "/2x.png";

          if (element.data.animated) {
            emote_url = "https:" + element.data.host.url + "/1x.gif";
          }

          if (!existing_emojis.includes(element.name) && emote_url) {
            final_emojis.set(element.name, emote_url);
          } else {
            logger.trace("emote already detected, not uploading..");
            detectedemotes++;
          }
        });

        if (final_emojis.size > 0) {
          logger.debug(
            `Syncing ${final_emojis.size}/${emotes.length} total emotes for ${channel}.. ${detectedemotes} already exist on the server.`
          );

          queue_add_success++;

          EmoteQueue.set(interaction.guild.id, {
            emotes: final_emojis,
            successes: 0,
            failures: 0,
            removed: detectedemotes,
            interaction: interaction,
          });

          await interaction.editReply(
            `**Successfully syncing ${final_emojis.size}/${emotes.length} emotes!  ${detectedemotes} already exist on the server.**
            \n * It will take up to 30 minutes or more depending on the queue.
            \n * Wide emotes will not upload properly.
            \n * GIFs may not upload or will upload in low quality. This is due to Discord's low upload limit.
            \n * To get around the upload limit you can link the GIF in any Discord chat and favorite it as a favorite GIF for later instead of in your emoji list.
            \n * Type \`/cancel-sync\` to cancel.
            \n * You can remove specific emotes from the queue by using the \`/qremove\` command.`
          );
          if (!timer) {
            timer = setInterval(ReadQueue, 15 * 1000);
          }
        } else {
          logger.debug(`No emotes found able to be synced for ${channel}..`);
          await interaction.editReply(
            `No emotes found to sync. If the emote name(s) already exist they will not be overridden.`
          );
        }
      } else {
        logger.debug(`Error syncing emotes for ${channel}..`);

        const currentQueue = EmoteQueue.get(interaction.guild.id);
        const emotes = currentQueue.emotes.size;

        await interaction.editReply(
          `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`
        );
      }
    }
  } else if (EmoteQueue.has(interaction.guild.id)) {
    logger.debug(
      `Error syncing emotes for ${channel}.. They are already in queue.`
    );

    const currentQueue = EmoteQueue.get(interaction.guild.id);
    const emotes = currentQueue.emotes.size;

    await interaction.editReply(
      `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`
    );
  }
}

/**
 * FrankerFaceZ Portion
 */

export let FFZ_emoji_queue_count = 0;
export let FFZ_emoji_queue_attempt_count = 0;

/**
 * Cancel the emote sync for the guild.
 * @param message
 */
export async function cancel_sync(
  interaction: CommandInteraction
): Promise<boolean> {
  const inQueue = EmoteQueue.get(interaction.guild.id);
  if (inQueue) {
    EmoteQueue.delete(interaction.guild.id);
    // inQueue.msg.editReply('Sync cancelled.  You can do another if you wish.');
    logger.debug(
      "Sync cancelled by " +
        interaction.user.username +
        " in " +
        interaction.guild.name
    );
    await interaction.editReply({ content: "👍" });

    if (EmoteQueue.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
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
  interaction: CommandInteraction
): Promise<void> {
  const channel = interaction.options.getString("channel");

  if (channel && !EmoteQueue.has(interaction.guild.id)) {
    await interaction.editReply(`Checking FrankerFaceZ API to sync emotes..`);

    logger.debug(
      `Fetching FFZ Emotes for Twitch channel ${channel} (requested by ${interaction.user.username} in ${interaction.guild.name})..`
    );

    const ffz_emotes: FFZRoom = await jsonFetch(
      `https://api.frankerfacez.com/v1/room/${channel}`
    );
    FFZ_emoji_queue_attempt_count++;

    if (!ffz_emotes || !ffz_emotes.room || !ffz_emotes.room.set) {
      logger.debug(`Couldn't fetch FFZ Emotes for Twitch channel ${channel}.`);

      await interaction.editReply(
        `There was an error fetching from FrankerFaceZ's API. \n\n Make sure the username is correct and there are no symbols. \n\n You may have to wait for FFZ's cache to update before getting certain emotes. This can take up to an hour.\n\nExample command: \`/sync-ffz summit1g\``
      );

      return;
    } else if (ffz_emotes.room.set) {
      const emojis = ffz_emotes.sets[ffz_emotes.room.set].emoticons;

      const existing_emojis = [];

      const final_emojis: Collection<string, string> = new Collection();

      interaction.guild.emojis.cache.forEach((value) => {
        existing_emojis.push(value.name);
      });

      if (!EmoteQueue.has(interaction.guild.id)) {
        emojis.forEach((element) => {
          element.name = element.name.replace(/\W/gm, "");
          const emote_url =
            ("https://" + element.urls["4"]?.replace("https:/", "") ||
              "https://" + element.urls["3"]?.replace("https:/", "") ||
              "https://" + element.urls["2"]?.replace("https:/", "") ||
              "https://" + element.urls["1"]?.replace("https:/", "")) ??
            undefined;

          if (
            !existing_emojis.includes(element.name) &&
            !emote_url.match("undefined") &&
            emote_url
          ) {
            final_emojis.set(element.name, emote_url);
          } else {
            logger.trace("emote already detected, not uploading..");
          }
        });

        if (final_emojis.size > 0) {
          logger.debug(
            `Syncing ${final_emojis.size}/${emojis.length} total emotes for ${channel}..`
          );

          FFZ_emoji_queue_count++;

          EmoteQueue.set(interaction.guild.id, {
            emotes: final_emojis,
            successes: 0,
            failures: 0,
            removed: 0,
            interaction: interaction,
          });

          await interaction.editReply(
            `**Successfully syncing ${final_emojis.size}/${emojis.length} emotes!** \n\n\n It will take up to 30 minutes or more depending on the queue. \n\n Type \`/cancel-sync\` to cancel. \n Type \`/stats\` to see how many servers are in queue.`
          );
          if (!timer) {
            timer = setInterval(ReadQueue, 15 * 1000);
          }
        } else {
          logger.debug(`No emotes found able to be synced for ${channel}..`);

          await interaction.editReply(
            `No emotes found to sync. If the emote name(s) already exist they will not be overridden.`
          );
        }
      } else {
        logger.debug(`Error syncing emotes for ${channel}..`);

        const currentQueue = EmoteQueue.get(interaction.guild.id);
        const emotes = currentQueue.emotes.size;
        await interaction.editReply(
          `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`
        );
      }
    }
  } else if (EmoteQueue.has(interaction.guild.id)) {
    logger.debug(
      `Error syncing emotes for ${channel}.. They are already in queue.`
    );

    const currentQueue = EmoteQueue.get(interaction.guild.id);
    const emotes = currentQueue.emotes.size;

    await interaction.editReply(
      `**You already have ${emotes} emotes in a queue. You cannot add more at this time.**`
    );
  }
}
