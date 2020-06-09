import dotenv from 'dotenv';

interface IConfig {
  DB_DATABASE?: string;
  DB_HOST?: string;
  DB_PASSWORD?: string;
  DB_USER?: string;
  DISCORD_TOKEN?: string
  LOG_LEVEL?: string
  TWITTER_CONSUMER_KEY?: string
  TWITTER_CONSUMER_SECRET?: string
  TWITTER_ACCESS_TOKEN_KEY?: string
  TWITTER_ACCESS_TOKEN_SECRET?: string
}

const config = dotenv.config({
  debug: process.env.NODE_ENV !== 'production',
});

/**
 * Returns the Config value for the specified key.
 *
 * @param key Config key to receive the value for.
 */
export function getConfigValue<K extends keyof IConfig>(key: K): IConfig[K] {
  return config.parsed?.[key];
}
