import { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { loadCache, type ICache } from '../../clients/cache';
import { getLogger } from '../../clients/logger';
import { getRndInteger } from '../../utils';
import Weather from './data/weather.json';

export type IWeather = typeof Weather[0];

const logger = getLogger('Weather');
const WEATHER_CACHE = loadCache('weather');

// Constants for better maintainability
const WEATHER_DURATION_MIN = 5;
const WEATHER_DURATION_MAX = 15;
const WEATHER_DURATION_MS = 60 * 1000;

/**
 * Get current weather boost for spawns, changing weather if needed
 * @param interaction - Discord command interaction
 * @param cache - Server cache
 * @returns Current weather boost
 */
export async function getBoostedWeatherSpawns(
  interaction: ChatInputCommandInteraction,
  cache: ICache,
): Promise<IWeather> {
  if (!interaction.guild?.id) {
    logger.warn('No guild ID found for weather boost request');
    return getRandomWeather();
  }

  const currentBoost = await WEATHER_CACHE.get(interaction.guild.id);

  if (!currentBoost) {
    return await changeWeather(interaction, cache);
  }

  const weatherDuration = getRndInteger(WEATHER_DURATION_MIN, WEATHER_DURATION_MAX) * WEATHER_DURATION_MS;
  const isExpired = Date.now() - currentBoost.time > weatherDuration;

  if (isExpired) {
    return await changeWeather(interaction, cache);
  }

  return currentBoost.weather;
}

/**
 * Change the current weather and announce it
 * @param interaction - Discord command interaction
 * @param cache - Server cache
 * @returns New weather boost
 */
async function changeWeather(
  interaction: ChatInputCommandInteraction,
  cache: ICache,
): Promise<IWeather> {
  const newWeather = getRandomWeather();
  const weatherBoost = {
    weather: newWeather,
    time: Date.now(),
  };

  if (interaction.guild?.id) {
    WEATHER_CACHE.set(interaction.guild.id, weatherBoost);
  }

  // Announce weather change
  await announceWeatherChange(interaction, cache, newWeather);

  return newWeather;
}

/**
 * Announce weather change in the appropriate channel
 * @param interaction - Discord command interaction
 * @param cache - Server cache
 * @param weather - New weather
 */
async function announceWeatherChange(
  interaction: ChatInputCommandInteraction,
  cache: ICache,
  weather: IWeather,
): Promise<void> {
  try {
    const channelName = cache?.settings?.specific_channel;
    if (!channelName || !interaction.guild) {
      logger.warn('No channel name or guild found for weather announcement');
      return;
    }

    const monsterChannel = interaction.guild.channels.cache.find(
      (ch) => ch.name === channelName,
    ) as TextChannel;

    if (!monsterChannel) {
      logger.warn(`Weather channel '${channelName}' not found`);
      return;
    }

    const boostedTypes = weather.boosts.join(' / ');
    const message = `The weather has changed! It is now **${weather.weather}**. ` +
                   `You will find increased spawns of **${boostedTypes}** types on this server.`;

    await monsterChannel.send(message);

  } catch (error) {
    logger.error('Error announcing weather change:', error);
  }
}

/**
 * Get random weather from available options
 * @returns Random weather object
 */
function getRandomWeather(): IWeather {
  return Weather[getRndInteger(0, Weather.length - 1)];
}

/**
 * Check if Pokemon types are boosted by current weather
 * @param interaction - Discord command interaction
 * @param pokemonTypes - Array of Pokemon type names
 * @returns Boolean indicating if Pokemon is weather boosted
 */
export async function isPokemonBoostedByWeather(
  interaction: ChatInputCommandInteraction,
  pokemonTypes: string[],
): Promise<boolean> {
  try {
    if (!interaction.guild?.id || !pokemonTypes?.length) {
      return false;
    }

    const currentWeather = await WEATHER_CACHE.get(interaction.guild.id);
    if (!currentWeather) {
      return false;
    }

    // Check if any of the Pokemon's types match the boosted types
    return pokemonTypes.some(type =>
      currentWeather.weather.boosts.some(boost =>
        boost.toLowerCase() === type.toLowerCase()
      )
    );

  } catch (error) {
    logger.error('Error checking weather boost for Pokemon:', error);
    return false;
  }
}

/**
 * Get current weather for a guild
 * @param guildId - Discord guild ID
 * @returns Current weather or null
 */
export async function getCurrentWeather(guildId: string): Promise<IWeather | null> {
  try {
    const weatherData = await WEATHER_CACHE.get(guildId);
    return weatherData?.weather || null;
  } catch (error) {
    logger.error('Error getting current weather:', error);
    return null;
  }
}

/**
 * Force weather change for testing/admin purposes
 * @param interaction - Discord command interaction
 * @param cache - Server cache
 * @param weatherType - Specific weather type (optional)
 * @returns New weather
 */
export async function forceWeatherChange(
  interaction: ChatInputCommandInteraction,
  cache: ICache,
  weatherType?: string,
): Promise<IWeather> {
  let targetWeather: IWeather;

  if (weatherType) {
    const foundWeather = Weather.find(w =>
      w.weather.toLowerCase() === weatherType.toLowerCase()
    );
    targetWeather = foundWeather || getRandomWeather();
  } else {
    targetWeather = getRandomWeather();
  }

  const weatherBoost = {
    weather: targetWeather,
    time: Date.now(),
  };

  if (interaction.guild?.id) {
    WEATHER_CACHE.set(interaction.guild.id, weatherBoost);
  }

  await announceWeatherChange(interaction, cache, targetWeather);

  logger.info(`Weather forcibly changed to ${targetWeather.weather} in guild ${interaction.guild?.id}`);

  return targetWeather;
}

export { Weather };
