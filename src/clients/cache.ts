import { Message } from 'discord.js';
import Keyv from 'keyv';

import { getLogger } from './logger';
import { IMonsterDex } from '../plugins/pokemon/monsters';

const logger = getLogger('Cache');

export interface ICache {
  tweet: [];
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

export const cacheClient = new Keyv<ICache>();
export const xp_cache = new Keyv();

cacheClient.on('error', (error) => logger.error(error));
xp_cache.on('error', (error) => logger.error(error));
