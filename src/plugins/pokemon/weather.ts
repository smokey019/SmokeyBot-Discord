import { Message } from 'discord.js';
import Keyv from 'keyv';
import { ICache } from '../../clients/cache';
import { initializing, rateLimited } from '../../clients/discord';
import { queueMsg } from '../../clients/queue';
import { getConfigValue } from '../../config';
import { getRndInteger } from '../../utils';
import Weather from './data/weather.json';

export type IWeather = typeof Weather[0];

const WEATHER_CACHE = new Keyv(
  `mysql://${getConfigValue('DB_USER')}:${getConfigValue(
    'DB_PASSWORD',
  )}@${getConfigValue('DB_HOST')}:${getConfigValue('DB_PORT')}/${getConfigValue(
    'DB_DATABASE',
  )}`,
  { keySize: 191, namespace: 'WEATHER_CACHE', pool: { min: 0, max: 7 } },
);

export async function getBoostedWeatherSpawns(
  message: Message,
  cache: ICache,
): Promise<IWeather> {
  let boost: IWeather = await WEATHER_CACHE.get(message.guild.id);

  if (!boost) {
    boost = Weather[getRndInteger(0, Weather.length - 1)];
    await WEATHER_CACHE.set(
      message.guild.id,
      boost,
      getRndInteger(1200, 3600) * 1000,
    );
    const monsterChannel = message.guild?.channels.cache.find(
      (ch) => ch.name === cache.settings.specific_channel,
    );

    if (!monsterChannel || !message.guild || rateLimited || initializing) {
      return boost;
    }

    queueMsg(
      `The weather has changed!  It is now **${
        boost.weather
      }**.  You will find increased spawns of **${boost.boosts.join(
        ' / ',
      )}** on this server.`,
      message,
      false,
      0,
      monsterChannel,
    );
    return boost;
  } else {
    return boost;
  }
}
