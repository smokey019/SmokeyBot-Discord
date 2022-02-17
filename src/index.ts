import { discordClient } from './clients/discord';
import { getLogger } from './clients/logger';
import { getConfigValue } from './config';

const logger = getLogger();

// Make sure we get a log of any exceptions that aren't checked
process.on('uncaughtException', (error) => {
  logger.error(error);
  throw error;
});

process.on('SIGINT', function () {
  console.log('\nGracefully shutting down from SIGINT (Ctrl-C)');
  // some other closing procedures go here
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error(error);
});

function startUp() {
  let token = undefined;

  if (JSON.parse(getConfigValue('DEV'))) {
    token = getConfigValue('DISCORD_TOKEN_DEV');
  } else {
    token = getConfigValue('DISCORD_TOKEN');
  }

  discordClient.login(token);
}

startUp();
