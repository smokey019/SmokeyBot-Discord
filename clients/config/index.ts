import dotenv from 'dotenv';

interface IConfig {
  DB_DATABASE: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_PASSWORD: string;
  DB_USER: string;
  DISCORD_TOKEN: string;
  DISCORD_TOKEN_DEV: string;
  API_CLIENT_ID: string;
  API_CLIENT_ID_DEV: string;
  DEV: string;
  LOG_LEVEL: string;
  SPAWN_TIME_MIN: string;
  SPAWN_TIME_MAX: string;
  SHINY_ODDS_RETAIL: string;
  SHINY_ODDS_COMMUNITY: string;
  TOPGG_KEY: string;
  SMOKEYBOT_API_TOKEN: string;
  API_URL: string;
}

const config = dotenv.config({
  debug: process.env.NODE_ENV !== 'production',
});