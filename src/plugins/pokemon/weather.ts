import Weather from './data/weather.json';
import Keyv from 'keyv';
import { getRndInteger } from '../../utils';

export type IWeather = typeof Weather[0];

const WEATHER_CACHE = new Keyv({ namespace: 'WEATHER_CACHE' });

export async function getBoostedWeatherSpawns(): Promise<IWeather> {
  const today = new Date();
  const date =
    today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();

  let boost: IWeather = await WEATHER_CACHE.get(date);

  if (!boost) {
    boost = Weather[getRndInteger(0, Weather.length - 1)];
    await WEATHER_CACHE.set(date, boost);
    return boost;
  } else {
    return boost;
  }
}
