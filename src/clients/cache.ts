import { Message } from 'discord.js';
import Keyv from 'keyv';

import { getLogger } from './logger';
import { IMonsterDex } from '../plugins/pokemon/monsters';
import { getConfigValue } from '../config';

const logger = getLogger('Cache');

export interface ICache {
  tweet: undefined | any;
  monster_spawn: {
    current_spawn?: IMonsterDex;
    last_spawn?: IMonsterDex;
    last_spawn_time?: number;
    msg?: Message;
  };
  settings: {
    id: number;
    guild_id: number | string;
    smokemon_enabled: number;
    specific_channel: string;
  };
  time?: number;
}

export const cacheClient = new Keyv<ICache>(
  `mysql://${getConfigValue('DB_USER')}:${getConfigValue(
    'DB_PASSWORD',
  )}@${getConfigValue('DB_HOST')}:3306/${getConfigValue('DB_DATABASE')}`,
  { keySize: 191, namespace: 'cacheClient' },
);
export const xp_cache = new Keyv({ namespace: 'xp_cache' });
export const cacheTwitter = new Keyv({ namespace: 'cacheTwitter' });
export const cacheTweets = new Keyv({ namespace: 'cacheTweets' });
export const cacheToBeDeleted = new Keyv({ namespace: 'cacheToBeDeleted' });

cacheClient.on('error', (error) => logger.error(error));
xp_cache.on('error', (error) => logger.error(error));
