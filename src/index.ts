import { discordClient } from './clients/discord';
import { getConfigValue } from './config';
import { getLogger } from './clients/logger';

const logger = getLogger();

// we don't bother catching here since we want the process to crash if it can't connect
discordClient.login(getConfigValue('DISCORD_TOKEN'))

// Make sure we get a log of any exceptions that aren't checked
process.on('uncaughtException', (error) => {
  logger.error(error)
  throw error
})
