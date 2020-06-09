import { Message } from 'discord.js';
import Keyv from 'keyv';

import { getLogger } from './logger';
import { IMonster } from '../plugins/pokemon/monsters';

const logger = getLogger('Cache');

export interface ICache {
  monster_spawn: {
    current_spawn?: IMonster;
    last_spawn?: IMonster;
    last_spawn_time?: number;
    msg?: Message;
  };
  settings: {
    specific_channel: string;
  };
  time?: number
}

export const cacheClient = new Keyv<ICache>();

cacheClient.on('error', (error) => logger.error(error));
