import { CommandInteraction, TextChannel } from 'discord.js';
import { ICache, loadCache } from '../../clients/cache';
import { getRndInteger } from '../../utils';
import Weather from './data/weather.json';

export type IWeather = typeof Weather[0];

const WEATHER_CACHE = loadCache('weather', 100);

export async function getBoostedWeatherSpawns(
  interaction: CommandInteraction,
  cache: ICache,
): Promise<IWeather> {
  const boost = await WEATHER_CACHE.get(interaction.guild.id);

  if (!boost) {
    const weather = await change_weather(interaction, cache);

    return weather;
  } else {
    if (Date.now() - boost.time > 60 * 1000 * getRndInteger(5, 15)) {
      const weather = await change_weather(interaction, cache);

      return weather;
    } else {
      return boost.weather;
    }
  }
}

async function change_weather(
  interaction: CommandInteraction,
  cache: ICache,
): Promise<IWeather> {
  const boost = {
    weather: Weather[getRndInteger(0, Weather.length - 1)],
    time: Date.now(),
  };
  WEATHER_CACHE.set(interaction.guild.id, boost);

  const monsterChannel = interaction.guild?.channels.cache.find(
    (ch) => ch.name === cache.settings.specific_channel,
  );

  (monsterChannel as TextChannel).send(
    `The weather has changed!  It is now **${
      boost.weather.weather
    }**.  You will find increased spawns of **${boost.weather.boosts.join(
      ' / ',
    )}** on this server.`,
  );

  return boost.weather;
}
