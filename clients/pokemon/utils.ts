/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommandInteraction, EmbedBuilder } from "discord.js";
import { discordClient } from "../../bot";
import { GLOBAL_COOLDOWN, type ICache } from "../../clients/cache";
import { getUserDBCount } from "../../clients/database";
import { dblCache } from "../../clients/top.gg";
import {
  format_number,
  getCurrentTime,
  getRndInteger,
  theWord,
} from "../../utils";
import { EmoteQueue, queueMsg } from "../emote_queue";
import {
  Stv_emoji_queue_attempt_count,
  Stv_emoji_queue_count,
} from "../smokeybot/emote-sync/sync-7tv-emotes";
import {
  FFZ_emoji_queue_attempt_count,
  FFZ_emoji_queue_count,
} from "../smokeybot/emote-sync/sync-ffz-emotes";
import { getMonsterDBCount, getShinyMonsterDBCount } from "./monsters";
import { getBoostedWeatherSpawns } from "./weather";

// const SHINY_ODDS_RETAIL = parseInt(getConfigValue('SHINY_ODDS_RETAIL'));
// const SHINY_ODDS_COMMUNITY = parseInt(getConfigValue('SHINY_ODDS_COMMUNITY'));

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
  return getRndInteger(1, 40) >= 40 ? 1 : 0;
}

export function rollPerfectIV(): 0 | 1 {
  return getRndInteger(1, 45) >= 45 ? 1 : 0;
}

export async function voteCommand(
  interaction: CommandInteraction
): Promise<void> {
  const voted = (await dblCache.get(interaction.user.id)) ?? { voted: false };

  if (!voted.voted) {
    queueMsg(
      `You haven't voted yet -- vote here and get free stuff for the Pokémon plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
      interaction,
      true
    );
  } else {
    queueMsg(
      `You've already voted, but maybe others want to vote here and get free stuff for the Pokémon plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
      interaction,
      true
    );
  }
}

export async function checkServerWeather(
  interaction: CommandInteraction,
  cache: ICache
): Promise<void> {
  const boost = await getBoostedWeatherSpawns(interaction, cache);

  queueMsg(
    `The current weather is **${
      boost.weather
    }**.  You will find increased spawns of **${boost.boosts.join(
      " / "
    )}** on this server.`,
    interaction,
    true
  );
}

export async function getBotStats(
  interaction: CommandInteraction
): Promise<void> {
  GLOBAL_COOLDOWN.set(interaction.guild.id, getCurrentTime());
  const ping = Date.now() - interaction.createdTimestamp;

  const embed = new EmbedBuilder()
    .setTitle("SmokeyBot Statistics 📊")
    .addFields(
      { name: "Ping 🌩️", value: ping + " ms" },
      {
        name: "Servers in Emote Queue 🔗",
        value: format_number(EmoteQueue.size),
      },
      {
        name: "Emote Synchronizations 🔼",
        value: `${format_number(
          Stv_emoji_queue_count + FFZ_emoji_queue_count
        )} / ${format_number(
          Stv_emoji_queue_attempt_count + FFZ_emoji_queue_attempt_count
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
