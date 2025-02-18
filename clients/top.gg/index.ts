
import { CommandInteraction } from "discord.js";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en.json";
import { URLSearchParams } from "node:url";
import { getLogger } from "../../clients/logger";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { loadCache } from "../cache";
import { databaseClient } from "../database";

TimeAgo.addDefaultLocale(en);

const timeAgo = new TimeAgo("en-US");

const logger = getLogger("Top.GG Client");
export const dblCache = loadCache("dblCache");
const API_CACHE = loadCache("API_CACHE");
let ap = undefined;

const cache = {
  // from https://github.com/isaacs/node-lru-cache
  data: new Map(),
  timers: new Map(),
  set: (k: any, v: any, ttl: number) => {
    if (cache.timers.has(k)) {
      clearTimeout(cache.timers.get(k));
    }
    cache.timers.set(
      k,
      setTimeout(() => cache.delete(k), ttl)
    );
    cache.data.set(k, v);
  },
  get: (k) => cache.data.get(k),
  has: (k) => cache.data.has(k),
  delete: (k) => {
    if (cache.timers.has(k)) {
      clearTimeout(cache.timers.get(k));
    }
    cache.timers.delete(k);
    return cache.data.delete(k);
  },
  clear: () => {
    cache.data.clear();
    for (const v of cache.timers.values()) {
      clearTimeout(v);
    }
    cache.timers.clear();
  },
};

async function requestGET(
  method = "GET",
  path: string,
  body?: any
): Promise<string> {
  let url = `https://top.gg/api/${path}`;
  if (body && method === "GET") url += `?${new URLSearchParams(body)}`;

  return fetch(url, {
    method: method,
    headers: { Authorization: process.env.TOPGG_KEY },
  }).then(async (res) => res.json());
}

/*async function requestPOST(
  method = 'POST',
  path: string,
  body?: any,
): Promise<any> {
  fetch(`https://top.gg/api/${path}`, {
    method: method,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.TOPGG_KEY'),
    },
  }).then(async (res) => res.json());
}*/

/**
 * Get whether or not a user has voted in the last 12 hours
 * @param {Snowflake} id User ID
 * @returns {Boolean} Whether the user has voted in the last 12 hours
 * @example
 * ```js
 * await api.hasVoted('205680187394752512')
 * // => true/false
 * ```
 */
async function hasVoted(id: string): Promise<any> {
  if (!id) throw new Error("Missing ID");
  return await requestGET("GET", "bots/check", { userId: id }).then(
    (x: any) => !!x.voted
  );
}

/**
 * Whether or not the weekend multiplier is active
 * @returns {Boolean} Whether the multiplier is active
 * @example
 * ```js
 * await api.isWeekend()
 * // => true/false
 * ```
 */
async function isWeekend(): Promise<any> {
  return await requestGET("GET", "weekend").then((x: any) => x.is_weekend);
}

export async function checkVote(
  interaction: CommandInteraction
): Promise<boolean> {
  const voted = (await dblCache.get(interaction.user.id)) ?? {
    voted: false,
    checked_at: Date.now() - 86401337,
  };

  if (!voted.voted || Date.now() - voted.checked_at > 43200000) {
    const check = await hasVoted(interaction.user.id);
    dblCache.set(interaction.user.id, { voted: check, checked_at: Date.now() });

    if (check) {
      const isWeekend = await checkWeekend();

      if (isWeekend) {
        interaction.reply(
          `Thanks for voting! It's the weekend so you receive double! You received **5,000 currency** and **2 Rare Candy** to level up your monster(s)! You can do this every 12 hours.`
        );

        for (let index = 0; index < 4; index++) {
          /*await createItemDB({
            uid: interaction.user.id,
            item_number: 50,
          });*/
        }

        await databaseClient<IMonsterUserModel>(MonsterUserTable)
          .where({ uid: interaction.user.id })
          .increment("currency", 5000);

        return true;
      } else {
        interaction.reply(
          `Thanks for voting! You received **2,500 currency** and a **Rare Candy** to level up a monster! You can do this every 12 hours.`
        );

        /*await createItemDB({
          uid: interaction.user.id,
          item_number: 50,
        });*/

        await databaseClient<IMonsterUserModel>(MonsterUserTable)
          .where({ uid: interaction.user.id })
          .increment("currency", 2500);

        return true;
      }
    } else {
      interaction.reply(`You haven't voted yet.`);

      return false;
    }
  } else if (voted.voted) {
    interaction.reply(
      `you voted ${timeAgo.format(
        voted.checked_at
      )} and got credit already. You can vote again ${timeAgo.format(
        voted.checked_at + 12 * 60 * 60 * 1000
      )}.`
    );

    return false;
  } else {
    logger.error("unknown top.gg error");
    return false;
  }
}

async function checkWeekend(): Promise<boolean> {
  const weekend = API_CACHE.get("weekend");

  if (!weekend) {
    const data = await isWeekend();
    API_CACHE.set("weekend", { weekend: data, time: Date.now() });
    return data;
  } else {
    if (Date.now() - weekend.time > 60) {
      const data = await isWeekend();
      API_CACHE.set("weekend", { weekend: data, time: Date.now() });
      return data;
    } else {
      return weekend.weekend;
    }
  }
}
