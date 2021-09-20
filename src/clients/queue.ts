import {
  Collection,
  GuildChannel,
  Message,
  TextBasedChannels,
  TextChannel,
} from 'discord.js';
import { FFZEmotes } from '../types/FFZ-Emotes';
import { rateLimited } from './discord';
import { getLogger } from './logger';

const logger = getLogger('Queue');

export const EmoteQueue: Collection<
  string,
  { emotes: FFZEmotes[]; msg: Message }
> = new Collection();
const COOLDOWN = 35 * 1000;

/*export const MsgQueue: Collection<
  string,
  { outgoingMsg: any; msg: Message; reply: boolean }
> = new Collection();*/

interface MsgQueueType {
  outgoingMsg: any;
  msg: Message;
  reply?: boolean;
  spawn?: GuildChannel | TextChannel | TextBasedChannels;
  embed?: boolean;
}

const MsgQueue: MsgQueueType[] = [];

setTimeout(runEmoteQueue, COOLDOWN);
setTimeout(runMsgQueue, 10000);

/**
 * Add a message to the message queue.
 * @param outgoingMsg String or Embed
 * @param msg Message to use for data.
 * @param reply Are we replying to the user?
 * @param priority `0` = Low, `1` = High
 * @param spawn Spawn channel. If undefined it won't send to a spawn channel.
 * @returns `TRUE` if added to the queue.
 */
export function queueMsg(
  outgoingMsg: any,
  msg: Message,
  reply = false,
  priority = 0,
  spawn?: GuildChannel | TextChannel | TextBasedChannels,
  embed?: boolean,
): boolean {
  if (outgoingMsg.toString().length >= 2000) return false;

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
function runMsgQueue() {
  if (MsgQueue.length > 0 && !rateLimited) {
    const object = MsgQueue.shift();

    try {
      if (!object.reply && !object.spawn) {
        object.msg.channel
          .send(object.outgoingMsg)
          .then(() =>
            logger.trace(`Sent a message in ${object.msg.guild.name}.`),
          );
      } else if (!object.reply && object.spawn && object.embed) {
        (object.spawn as TextChannel).send({ embeds: [object.outgoingMsg] });
      } else if (!object.reply && object.spawn) {
        (object.spawn as TextChannel).send(object.outgoingMsg);
      } else {
        object.msg
          .reply(object.outgoingMsg)
          .then(() =>
            logger.trace(
              `Sent a reply to ${object.msg.author.username} in ${object.msg.guild.name}.`,
            ),
          );
      }
      setTimeout(runMsgQueue, 250);
    } catch (error) {
      logger.error(error);
    }
  } else {
    if (rateLimited) {
      setTimeout(runMsgQueue, 10000);
    } else {
      setTimeout(runMsgQueue, 100);
    }
  }
}

/**
 * Repeating timed function to run the emote upload queue.
 */
async function runEmoteQueue() {
  if (EmoteQueue.first() && !rateLimited) {
    const object = EmoteQueue.first();
    const emote: FFZEmotes = object.emotes?.shift() ?? null;
    const message = object.msg;

    EmoteQueue.set(message.guild.id, object);

    if (emote) {
      let emote_url = '';

      if (emote.urls['2']) {
        emote_url = 'https:' + emote.urls['2'];
      }
      if (emote.urls['4'] && !emote.urls['2']) {
        emote_url = 'https:' + emote.urls['4'];
      }
      if (emote.urls['1'] && !emote.urls['2'] && !emote.urls['4']) {
        emote_url = 'https:' + emote.urls['1'];
      }

      if (!emote_url.match('undefined')) {
        logger.trace(
          `Attempting to create emoji '${emote.name}' on ${message.guild.name}.`,
        );
        create_emoji(emote_url, message, emote.name);
        setTimeout(runEmoteQueue, COOLDOWN);
      } else {
        logger.trace(
          `Failed to create emoji '${emote.name}' on ${message.guild.name}.`,
        );
        setTimeout(runEmoteQueue, COOLDOWN);
      }
    } else {
      const temp = EmoteQueue.first();
      logger.debug(`Successfully finished queue for ${temp.msg.guild.name}.`);
      EmoteQueue.delete(EmoteQueue.firstKey());
      setTimeout(runEmoteQueue, COOLDOWN);
    }
  } else {
    setTimeout(runEmoteQueue, COOLDOWN);
  }
}

/**
 * Function to create an emoji in a Discord server.
 * @param emote_url Emote URL (256kb limit)
 * @param message Discord Message Object
 * @param name String
 * @returns true/false
 */
async function create_emoji(
  emote_url: string,
  message: Message,
  name: string,
): Promise<boolean> {
  try {
    if (
      await message.guild.emojis.create(emote_url, name).then(async (emoji) => {
        logger.debug(
          `Created new emoji with name ${emoji.name} in ${emoji.guild.name}.`,
        );
        return true;
      })
    ) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    switch (err.message) {
      case 'Maximum number of emojis reached (50)':
      case 'Maximum number of emojis reached (75)':
      case 'Maximum number of emojis reached (100)':
      case 'Maximum number of emojis reached (250)':
        EmoteQueue.delete(message.guild.id);
        logger.info(
          `Maximum emojis reached for server '${message.guild.name}'.`,
        );
        await message.reply(
          `you've reached the maximum amount of emotes for the server.`,
        );
        return false;

      case 'Missing Permissions':
        EmoteQueue.delete(message.guild.id);
        logger.info(`Improper permissions for server '${message.guild.name}'.`);
        await message.reply(
          `SmokeyBot doesn't have the proper permissions. Make sure SmokeyBot can Manage Emoji in the roles section.`,
        );
        return false;

      default:
        logger.error('Emote error:', err);
        return false;
    }
  }
}
