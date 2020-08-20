import { getLogger } from '../../clients/logger';
import { discordClient } from '../../clients/discord';
import { Message } from 'discord.js';

const logger = getLogger('SmokeyBot');

export async function checkForEmptyServers(message: Message): Promise<any> {
  const all_guilds = discordClient.guilds.cache;
  let leave_count = 0;
  let timeout = 5;

  all_guilds.forEach((element) => {
    if (element.memberCount < 5 && element.ownerID != '90514165138989056') {
      setTimeout(() => {
        if (element.leave()) {
          logger.debug(
            `${element.memberCount} - ${element.name} - Leaving server..`,
          );
        }
      }, timeout * 1000);
      timeout = timeout + 5;
      leave_count++;
    }
  });

  logger.info(`We're leaving ${leave_count} servers.`);
  message.reply(`We're leaving ${leave_count} servers.`);
}
