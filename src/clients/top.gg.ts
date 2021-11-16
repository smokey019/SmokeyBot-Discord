import Topgg from '@top-gg/sdk';
import { Message } from 'discord.js';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en.json';
import { AutoPoster } from 'topgg-autoposter';
import { getConfigValue } from '../config';
import { IMonsterUserModel, MonsterUserTable } from '../models/MonsterUser';
import { createItemDB } from '../plugins/pokemon/items';
import { loadCache } from './cache';
import { databaseClient } from './database';
import { discordClient } from './discord';
import { getLogger } from './logger';

export const dblClient = new Topgg.Api(getConfigValue('TOPGG_KEY'));

TimeAgo.addDefaultLocale(en);

const timeAgo = new TimeAgo('en-US');

const logger = getLogger('Top.GG Client');
export const dblCache = loadCache('dblCache');
const API_CACHE = loadCache('API_CACHE');
const ap = AutoPoster(getConfigValue('TOPGG_KEY'), discordClient);

dblClient.on('error', (e) => {
  logger.error(`Oops! ${e}`);
});

ap.on('posted', () => {
  logger.info('Posted stats to Top.gg!');
});

export async function checkVote(message: Message): Promise<boolean> {
  const voted = (await dblCache.get(message.author.id)) ?? {
    voted: false,
    checked_at: Date.now() - 86401337,
  };

  if (!voted.voted || Date.now() - voted.checked_at > 43200000) {
    const check = await dblClient.hasVoted(message.author.id);
    dblCache.set(message.author.id, { voted: check, checked_at: Date.now() });

    if (check) {
      const isWeekend = await checkWeekend();

      if (isWeekend) {
        await message.reply(
          `Thanks for voting! It's the weekend so you receive double! You received **5,000 currency** and **2 Rare Candy** to level up your monster(s)! You can do this every 12 hours.`,
        );

        for (let index = 0; index < 4; index++) {
          await createItemDB({
            uid: message.author.id,
            item_number: 50,
          });
        }

        await databaseClient<IMonsterUserModel>(MonsterUserTable)
          .where({ uid: message.author.id })
          .increment('currency', 5000);

        return true;
      } else {
        await message.reply(
          `Thanks for voting! You received **2,500 currency** and a **Rare Candy** to level up a monster! You can do this every 12 hours.`,
        );

        await createItemDB({
          uid: message.author.id,
          item_number: 50,
        });

        await databaseClient<IMonsterUserModel>(MonsterUserTable)
          .where({ uid: message.author.id })
          .increment('currency', 2500);

        return true;
      }
    } else {
      await message.reply(`you haven't voted yet, m8. WeirdChamp`);

      return false;
    }
  } else if (voted.voted) {
    await message.reply(
      `you voted ${timeAgo.format(
        voted.checked_at,
      )} and got credit already. You can vote again ${timeAgo.format(
        voted.checked_at + 12 * 60 * 60 * 1000,
      )}.`,
    );

    return false;
  } else {
    logger.error('unknown top.gg error');
    return false;
  }
}

async function checkWeekend(): Promise<boolean> {
  const weekend = API_CACHE.get('weekend');

  if (!weekend) {
    const data = await dblClient.isWeekend();
    API_CACHE.set('weekend', { weekend: data, time: Date.now() });
    return data;
  } else {
    if (Date.now() - weekend.time > 60) {
      const data = await dblClient.isWeekend();
      API_CACHE.set('weekend', { weekend: data, time: Date.now() });
      return data;
    } else {
      return weekend.weekend;
    }
  }
}
