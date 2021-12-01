/* eslint-disable @typescript-eslint/no-explicit-any */
import { Message, MessageEmbed } from 'discord.js';
import { GLOBAL_COOLDOWN, ICache } from '../../clients/cache';
import { getUserDBCount } from '../../clients/database';
import { discordClient } from '../../clients/discord';
import { EmoteQueue } from '../../clients/queue';
import { dblCache } from '../../clients/top.gg';
import { COLOR_BLACK } from '../../colors';
import {
  format_number,
  getCurrentTime,
  getRndInteger,
  theWord
} from '../../utils';
import { Stv_emoji_queue_attempt_count, Stv_emoji_queue_count } from '../smokeybot/emote-sync/sync-7tv-emotes';
import { FFZ_emoji_queue_attempt_count, FFZ_emoji_queue_count } from '../smokeybot/emote-sync/sync-ffz-emotes';
import { getMonsterDBCount, getShinyMonsterDBCount } from './monsters';
import { getPrefixes } from './parser';
import { getBoostedWeatherSpawns } from './weather';

// const SHINY_ODDS_RETAIL = parseInt(getConfigValue('SHINY_ODDS_RETAIL'));
// const SHINY_ODDS_COMMUNITY = parseInt(getConfigValue('SHINY_ODDS_COMMUNITY'));

export async function parseArgs(message: Message): Promise<{
  search: string;
  page: number;
  sort: any;
  isQuote: RegExpMatchArray;
  args: any;
}> {
  const isQuote = message.content.match('"');
  const sort = ['id', 'high'];
  let search = undefined;
  let page = 0;

  const load_prefixes = await getPrefixes(message.guild.id);
  const prefixes = RegExp(load_prefixes.join('|'));
  const detect_prefix = message.content.match(prefixes);
  const prefix = detect_prefix.shift();
  const args = message.content
    .slice(prefix.length)
    .trim()
    .toLowerCase()
    .replace(/ {2,}/gm, ' ')
    .split(/ +/gm);

  if (!isNaN(parseInt(args[args.length - 1]))) {
    page = parseInt(args[args.length - 1]);
    args.splice(args.length - 1, 1);
    search = args.join(' ');
  } else if (args.length >= 2 && isNaN(parseInt(args[args.length - 1]))) {
    page = 0;
    search = args.join(' ');
  } else {
    search = args.join(' ');
  }

  return {
    search: search,
    page: page,
    sort: sort,
    isQuote: isQuote,
    args: args,
  };
}

/**
 * Returns a randomized level.
 */
export function rollLevel(min: number, max: number): number {
  return getRndInteger(min, max);
}

/**
 *
 * @returns Gender in M or F
 */
export function rollGender(): string {
  const genders = ['M', 'F'];
  return genders[getRndInteger(0, 1)];
}

/**
 * Returns a randomized value for if an item is shiny. (1 is shiny, 0 is not)
 */
export function rollShiny(): 0 | 1 {
  return getRndInteger(1, 40) >= 40 ? 1 : 0;
}

export function rollPerfectIV(): 0 | 1 {
  return getRndInteger(1, 45) >= 45 ? 1 : 0;
}

export async function voteCommand(message: Message): Promise<void> {
  const voted = (await dblCache.get(message.author.id)) ?? { voted: false };

  if (!voted.voted) {
    await message.reply(
      `You haven't voted yet -- vote here and get free stuff for the Pokémon plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
    );
  } else {
    await message.reply(
      `You've already voted, but maybe others want to vote here and get free stuff for the Pokémon plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
    );
  }
}

export async function checkServerWeather(
  message: Message,
  cache: ICache,
): Promise<void> {
  const boost = await getBoostedWeatherSpawns(message, cache);

  await message.reply(
    `The current weather is **${
      boost.weather
    }**.  You will find increased spawns of **${boost.boosts.join(
      ' / ',
    )}** on this server.`,
  );
}

export async function getBotStats(message: Message): Promise<void> {
  GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
  const ping = Date.now() - message.createdTimestamp;

  const embed = new MessageEmbed()
    .setColor(COLOR_BLACK)
    .setTitle('SmokeyBot Statistics')
    .addField('Ping', ping + ' ms', true)
    .addField(
      'Servers in Emote Queue 🔌',
      format_number(EmoteQueue.size),
      true,
    )
    .addField(
      'Emote Sync Attempts 🔴',
      format_number(Stv_emoji_queue_attempt_count + FFZ_emoji_queue_attempt_count),
      true,
    )
    .addField(
      'Emote Successful Syncs 🟢',
      format_number(Stv_emoji_queue_count + FFZ_emoji_queue_count),
      true,
    )
    .addField(
      'Total Servers 🖥️',
      format_number(discordClient.guilds.cache.size),
      true,
    )
    .addField(
      'Total ' + theWord(),
      format_number(await getMonsterDBCount()),
      true,
    )
    .addField(
      'Total Shiny ' + theWord(),
      format_number(await getShinyMonsterDBCount()),
      true,
    )
    .addField(
      'Total ' + theWord() + ' Users',
      format_number(await getUserDBCount()),
      true,
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

export const img_monster_ball = `https://cdn.discordapp.com/attachments/550103813587992586/721256683665621092/pokeball2.png`;
