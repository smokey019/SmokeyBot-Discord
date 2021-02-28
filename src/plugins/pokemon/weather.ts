import Keyv from 'keyv';
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
	channel_id: string,
): Promise<IWeather> {
	let boost: IWeather = await WEATHER_CACHE.get(channel_id);

	if (!boost) {
		boost = Weather[getRndInteger(0, Weather.length - 1)];
		await WEATHER_CACHE.set(
			channel_id,
			boost,
			getRndInteger(600, 3600) * 1000,
		);
		return boost;
	} else {
		return boost;
	}
}
