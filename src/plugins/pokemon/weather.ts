import Weather from './data/weather.json';
import Keyv from 'keyv';
import { getRndInteger } from '../../utils';
import { getConfigValue } from '../../config';

export type IWeather = typeof Weather[0];

const WEATHER_CACHE = new Keyv(
  `mysql://${getConfigValue('DB_USER')}:${getConfigValue(
    'DB_PASSWORD',
  )}@${getConfigValue('DB_HOST')}:3306/${getConfigValue('DB_DATABASE')}`,
  { keySize: 191, namespace: 'WEATHER_CACHE' },
);

export async function getBoostedWeatherSpawns(
  channel_id: string,
): Promise<IWeather> {
  let boost: IWeather = await WEATHER_CACHE.get(channel_id);

  if (!boost) {
    boost = Weather[getRndInteger(0, Weather.length - 1)];
    await WEATHER_CACHE.set(
      channel_id,
      boost,
      getRndInteger(3600, 7200) * 1000,
    );
    return boost;
  } else {
    return boost;
  }
}
