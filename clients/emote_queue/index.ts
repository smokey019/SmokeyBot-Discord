/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Collection,
  CommandInteraction,
  GuildChannel,
  TextChannel,
  type TextBasedChannel,
} from "discord.js";
import Queue from "queue";
import { rateLimited } from "../../bot";
import { getLogger } from "../logger";

export const q = new Queue({ results: [] });
q.autostart = true;
q.concurrency = 1;

q.addEventListener("timeout", (e) => {
  console.log("job timed out:", e.detail.job.toString().replace(/\n/g, ""));
  e.detail.next();
});

const logger = getLogger("Queue");
let successes = 0;
let failed = 0;

export const EmoteQueue: Collection<
  string,
  {
    emotes: any[];
    msg: CommandInteraction;
  }
> = new Collection();
const EMOTE_COOLDOWN = 10 * 1000;
const MSG_COOLDOWN = 1.5 * 1000;
export let last_message = undefined;

/*export const MsgQueue: Collection<
  string,
  { outgoingMsg: any; msg: Message; reply: boolean }
> = new Collection();*/

interface MsgQueueType {
  outgoingMsg: any;
  msg: CommandInteraction;
  reply?: boolean;
  spawn?: GuildChannel | TextChannel | TextBasedChannel;
  embed?: boolean;
}

const MsgQueue: MsgQueueType[] = [];

let timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
let timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);

/**
 * Reset and clear a queue.
 * @param queue 'emote' or 'message' queues.
 */
export async function resetQueue(
  queue = "emote",
  interaction: CommandInteraction
): Promise<void> {
  switch (queue) {
    case "emote":
      clearTimeout(timerEmoteQ);
      EmoteQueue.clear();
      timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
      await (interaction as CommandInteraction).reply(
        "Successfully reset emote queue."
      );
      logger.error("Reset emote queue.");

      break;
    case "message":
      clearTimeout(timerMsgQ);
      EmoteQueue.clear();
      timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
      await (interaction as CommandInteraction).reply(
        "Successfully reset message queue."
      );
      logger.error("Reset message queue.");

      break;
  }
}

/**
 * Add a message to the message queue.
 * @param outgoingMsg String or Embed
 * @param msg Message to use for data.
 * @param reply Are we replying to the user?
 * @param priority `0` = Low, `1` = High
 * @param spawn Spawn channel. If undefined it won't send to a spawn channel.
 * @param embed true/false
 * @returns `TRUE` if added to the queue.
 */
export function queueMsg(
  outgoingMsg: any,
  msg: CommandInteraction,
  reply = false,
  priority = 0,
  spawn?: GuildChannel | TextChannel | TextBasedChannel,
  embed?: boolean
): boolean {
  if (
    outgoingMsg.toString().length >= 2000 ||
    !outgoingMsg ||
    outgoingMsg == last_message
  )
    return false;

  switch (priority) {
    // low priority
    case 0:
      MsgQueue.push({
        outgoingMsg: outgoingMsg,
        msg: msg,
        reply: reply,
        spawn: spawn,
        embed: embed,
      });
      return true;

    // high priority
    case 1:
      MsgQueue.unshift({
        outgoingMsg: outgoingMsg,
        msg: msg,
        reply: reply,
        spawn: spawn,
        embed: embed,
      });
      return true;

    // low priority
    default:
      MsgQueue.push({
        outgoingMsg: outgoingMsg,
        msg: msg,
        reply: reply,
        spawn: spawn,
        embed: embed,
      });
      return true;
  }
}

/**
 * Repeating timed function to run the message queue.
 */
async function runMsgQueue() {
  if (MsgQueue.length > 0 && !rateLimited) {
    const object = MsgQueue.shift();
    if (!object) {
      timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
      return;
    } else {
      try {
        if (!object.reply && !object.spawn && !object.embed) {
          object.msg.channel.send(object.outgoingMsg).then(() => {
            try {
              logger.debug(`Sent a message in ${object.msg.guild?.name}.`);
              last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
            } catch (error) {
              logger.error(error);
              timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
            }
          });
        } else if (!object.reply && object.spawn && object.embed) {
          (object.spawn as TextChannel).send({ embeds: [object.outgoingMsg] });
          last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
        } else if (!object.reply && !object.spawn && object.embed) {
          object.msg.channel.send({ embeds: [object.outgoingMsg] });
          last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
        } else if (object.reply && !object.spawn && object.embed) {
          object.msg.reply({ embeds: [object.outgoingMsg] });
          last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
        } else if (!object.reply && object.spawn) {
          (object.spawn as TextChannel).send(object.outgoingMsg);
          last_message = `${object.msg.guild.name} -> ${object.outgoingMsg.description}`;
        } else {
          await object.msg.reply(object.outgoingMsg);
        }
        timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
      } catch (error) {
        logger.error(error);
        timerMsgQ = setTimeout(runMsgQueue, MSG_COOLDOWN);
      }
    }
  } else {
    if (rateLimited) {
      timerMsgQ = setTimeout(runMsgQueue, 10000);
    } else {
      timerMsgQ = setTimeout(runMsgQueue, 500);
    }
  }
}

/**
 * Repeating timed function to run the emote upload queue.
 */
async function runEmoteQueue() {
  try {
    const object = EmoteQueue.first();

    if (object && !rateLimited) {
      const emote = object.emotes?.shift();

      EmoteQueue.set(object.msg.guild.id, object);

      if (emote) {
        logger.debug(
          `Attempting to create emoji '${emote.name}' on ${object.msg.guild.name}.`
        );
        q.push(async () => {
          await create_emoji(emote.url, object.msg, emote.name);
        });
        timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
      } else {
        const temp = EmoteQueue.first();
        logger.debug(
          `Successfully finished ${successes} queue for ${temp.msg.guild.name}. ${failed} failed uploading.`
        );
        temp.msg.editReply(
          `Finished uploading ${successes} emotes. ${failed} failed to upload. You can upload single emotes that were missed by using the \`/upload\` command.`
        );
        successes = 0;
        failed = 0;
        EmoteQueue.delete(EmoteQueue.firstKey());
        timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
      }
    } else {
      logger.trace(`Nothing in queue.  Waiting for something to do..`);
      timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
    }
  } catch (error) {
    console.error("Emote Queue Error:", error);
    timerEmoteQ = setTimeout(runEmoteQueue, EMOTE_COOLDOWN);
  }
}

/**
 * Remove a guild from the emote queue.
 * @param log What to send to logger
 * @param response Response to user
 * @param interaction Interaction object
 */
async function removeFromQueue(
  log: string,
  response: string,
  interaction: CommandInteraction
): Promise<any> {
  EmoteQueue.delete(interaction.guild.id);
  logger.error(log);

  await interaction.editReply(response);

  // reset numbers

  successes = 0;
  failed = 0;
}

/**
 * Function to create an emoji in a Discord server.
 * @param emote_url Emote URL (256kb limit)
 * @param interaction Interaction Object
 * @param name String
 * @returns true/false
 */
async function create_emoji(
  emote_url: string,
  interaction: CommandInteraction,
  name: string
): Promise<boolean> {
  try {
    if (
      await interaction.guild.emojis
        .create({ attachment: emote_url, name: name })
        .then(async (emoji) => {
          logger.debug(
            `Created new emoji with name ${emoji.name} in ${emoji.guild.name}.`
          );

          successes++;

          const total = EmoteQueue.at(0).emotes.length;
          const estimatedTime = Math.floor((total * 10) / 60) + ' minutes' || Math.floor(total * 10) + ' seconds';

          interaction.editReply(
            `Uploaded ${successes} emotes so far. \n\n${total} left to upload.  \n\n${failed} failed. \n\nEstimated ${estimatedTime} left to finish queue.  \`/cancel-sync\` to cancel queue.`
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
      logger.debug(`'${name}' is too big, won't be uploaded.`);
      interaction.editReply(`\`'${name}'\` is too big, won't be uploaded.`)

      failed++;

      return false;
    } else if (err.message.match("Maximum number")) {
      await removeFromQueue(
        `Maximum emojis reached for server '${interaction.guild.name}'.`,
        `You've reached the maximum amount of emotes for the server.  Make sure you have enough animated AND standard emote slots.  Either one being full will prevent the bot from uploading emotes. \n\n Uploaded ${successes} emotes. ${failed} failed.`,
        interaction
      );

      return false;
    } else if (err.message.match("Missing Permissions")) {
      await removeFromQueue(
        `Improper permissions for server '${interaction.guild.name}'.`,
        `SmokeyBot doesn't have the proper permissions. Make sure SmokeyBot can Manage Emoji in the roles section. \n\n Uploaded ${successes} emotes. ${failed} failed.`,
        interaction
      );

      return false;
    } else {
      logger.error(err);

      return false;
    }
  }
}
