import { CommandInteraction, EmbedBuilder } from "discord.js";
import TimeAgo from "javascript-time-ago";
import { discordClient } from "../../bot";
import { GLOBAL_COOLDOWN, type ICache } from "../../clients/cache";
import { getUserDBCount } from "../../clients/database";
import {
  format_number,
  getCurrentTime,
  getRndInteger,
  theWord,
} from "../../utils";
import {
  EmoteQueue,
  FFZ_emoji_queue_attempt_count,
  FFZ_emoji_queue_count,
  queue_add_success,
  queue_attempts,
} from "../emote_queue";
import { getMonsterDBCount, getShinyMonsterDBCount } from "./monsters";
import { getBoostedWeatherSpawns } from "./weather";

const timeAgo = new TimeAgo("en-US");

// const SHINY_ODDS_RETAIL = parseInt(getConfigValue('SHINY_ODDS_RETAIL'));
// const SHINY_ODDS_COMMUNITY = parseInt(getConfigValue('SHINY_ODDS_COMMUNITY'));

export function capitalizeFirstLetter(val: string): string {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export async function parseArgs(args: string[]): Promise<{
  search: string;
  page: number;
  sort: any;
  isQuote: RegExpMatchArray | boolean;
  args: any;
}> {
  const isQuote = false;
  const sort = ["id", "high"];
  let search = undefined;
  let page = 0;

  if (!isNaN(parseInt(args[args.length - 1]))) {
    page = parseInt(args[args.length - 1]);
    args.splice(args.length - 1, 1);
    search = args.join(" ");
  } else if (args.length >= 2 && isNaN(parseInt(args[args.length - 1]))) {
    page = 0;
    search = args.join(" ");
  } else {
    search = args.join(" ");
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
  const genders = ["M", "F"];
  return genders[getRndInteger(0, 1)];
}

/**
 * Returns a randomized value for if an item is shiny. (1 is shiny, 0 is not)
 */
export function rollShiny(): 0 | 1 {
  return getRndInteger(1, parseInt(process.env.SHINY_ODDS_RETAIL)) >=
    parseInt(process.env.SHINY_ODDS_RETAIL)
    ? 1
    : 0;
}

export function rollPerfectIV(): boolean {
  return getRndInteger(1, 45) >= 45 ? true : false;
}

export async function checkServerWeather(
  interaction: CommandInteraction,
  cache: ICache
): Promise<void> {
  const boost = await getBoostedWeatherSpawns(interaction, cache);

  interaction.reply(
    `The current weather is **${
      boost.weather
    }**.  You will find increased spawns of **${boost.boosts.join(
      " / "
    )}** on this server.`
  );
}

export async function getBotStats(
  interaction: CommandInteraction
): Promise<void> {
  GLOBAL_COOLDOWN.set(interaction.guild.id, getCurrentTime());
  const ping = Date.now() - interaction.createdTimestamp;
  const pingNew = timeAgo.format(interaction.createdTimestamp);

  const embed = new EmbedBuilder()
    .setTitle("SmokeyBot Statistics 📊")
    .addFields(
      { name: "Requested at 🌩️", value: pingNew },
      {
        name: "Servers in Emote Queue 🔗",
        value: format_number(EmoteQueue.size),
      },
      {
        name: "Emote Synchronizations 🔼",
        value: `${format_number(
          queue_attempts + FFZ_emoji_queue_count
        )} / ${format_number(
          queue_add_success + FFZ_emoji_queue_attempt_count
        )}`,
      },
      {
        name: "Servers On This Shard 🖥️",
        value: format_number(discordClient.guilds.cache.size),
      },
      {
        name: "Total " + theWord() + " 🐾",
        value: format_number(await getMonsterDBCount()),
      },
      {
        name: "Total Shiny " + theWord() + " 🌟",
        value: format_number(await getShinyMonsterDBCount()),
      },
      {
        name: "Total " + theWord() + " Users 👤",
        value: format_number(await getUserDBCount()),
      }
    )
    .setTimestamp();

  await (interaction as CommandInteraction).reply({ embeds: [embed] });
}

export const img_monster_ball = `https://cdn.discordapp.com/attachments/550103813587992586/721256683665621092/pokeball2.png`;
