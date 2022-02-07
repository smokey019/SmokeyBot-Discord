import { CommandInteraction } from 'discord.js';
import { discordClient } from '../../clients/discord';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';

const logger = getLogger('SmokeyBot');

export async function checkForEmptyServers(interaction: CommandInteraction): Promise<any> {
  const all_guilds = discordClient.guilds.cache;
  let leave_count = 0;
  let timeout = 5;

  all_guilds.forEach((element) => {
    if (element.memberCount < 5 && element.ownerId != '90514165138989056') {
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
  queueMsg(`We're leaving ${leave_count} servers.`, interaction, true);
}
