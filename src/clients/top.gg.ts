import DBL from 'dblapi.js';
import { getConfigValue } from '../config';
import { getLogger } from './logger';
import Keyv from 'keyv';
import { discordClient } from './discord';
import { Message } from 'discord.js';
import { databaseClient, getUser } from './database';
import { IMonsterUserModel, MonsterUserTable } from '../models/MonsterUser';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

TimeAgo.addLocale(en);

const timeAgo = new TimeAgo('en-US');

export const dblClient = new DBL(getConfigValue('TOPGG_KEY'), discordClient);
const logger = getLogger('Top.GG Client');
const dblCache = new Keyv(
  `mysql://${getConfigValue('DB_USER')}:${getConfigValue(
    'DB_PASSWORD',
  )}@${getConfigValue('DB_HOST')}:3306/${getConfigValue('DB_DATABASE')}`,
  { keySize: 191, namespace: 'dblCache', ttl: 43200 * 1000 },
);
const API_CACHE = new Keyv({ namespace: 'DBL_API_CACHE', ttl: 60 * 1000 });

dblClient.on('error', (e) => {
  logger.error(`Oops! ${e}`);
});

export async function checkVote(message: Message): Promise<any> {
  let voted = await dblCache.get(message.author.id + ':voted');

  if (!voted) {
    voted = await dblClient.hasVoted(message.author.id);
    const isWeekend = await checkWeekend();
    if (voted) {
      await dblCache.set(message.author.id + ':voted', Date.now());

      const user = await getUser(message.author.id);

      const items = JSON.parse(user.items);

      if (isWeekend) {
        await message.reply(
          `Thanks for voting! It's the weekend so you recieve double! You received **10,000 currency** and **2 Rare Candy** to level up your monster(s)! You can do this every 12 hours.`,
        );

        items.push(50);
        items.push(50);

        await databaseClient<IMonsterUserModel>(MonsterUserTable)
          .where({ uid: message.author.id })
          .update({ items: JSON.stringify(items) })
          .increment('currency', 10000);
      } else {
        await message.reply(
          `Thanks for voting! You received **5,000 currency** and a **Rare Candy** to level up a monster! You can do this every 12 hours.`,
        );

        items.push(50);

        await databaseClient<IMonsterUserModel>(MonsterUserTable)
          .where({ uid: message.author.id })
          .update({ items: JSON.stringify(items) })
          .increment('currency', 5000);
      }

      return true;
    } else {
      await message.reply(`you haven't voted yet, m8. WeirdChamp`);

      return false;
    }
  } else {
    await message.reply(
      `you voted ${timeAgo.format(
        voted,
      )} and got credit already. You can vote again ${timeAgo.format(
        voted + 12 * 60 * 60 * 1000,
      )}.`,
    );

    return false;
  }
}

async function checkWeekend() {
  const weekend = await API_CACHE.get('weekend');

  if (!weekend) {
    const data = await dblClient.isWeekend();
    await API_CACHE.set('weekend', data);
    return data;
  } else {
    return weekend;
  }
}
