import {
  GuildSettingsTable,
  databaseClient,
  IGuildSettings,
} from '../../clients/database';
import { Message } from 'discord.js';
import { getCurrentTime } from '../../utils';
import { ICache, cacheClient } from '../../clients/cache';
import { getLogger } from '../../clients/logger';

const logger = getLogger('Pokemon');

export async function toggleSmokeMon(
  message: Message,
  cache: ICache,
): Promise<boolean | void> {
  if (!message.member.hasPermission('ADMINISTRATOR')) {
    return false;
  }

  const splitMsg = message.content.split(' ');

  if (splitMsg.length > 1) {
    cache.time = getCurrentTime();

    if (splitMsg[1] == 'enable') {
      const updateGuild = await databaseClient<IGuildSettings>(
        GuildSettingsTable,
      )
        .where({ guild_id: message.guild.id })
        .update({ smokemon_enabled: 1 });

      if (updateGuild) {
        logger.info(
          `SmokeMon enabled in ${message.guild.name} | ${message.guild.id}.`,
        );

        message.reply(
          'SmokeMon enabled! This plugin is for fun and SmokeyBot does not own the rights to any images/data and images/data are copyrighted by the Pokémon Company and its affiliates.',
        );

        cache.settings.smokemon_enabled = 1;

        if (message.guild) {
          cacheClient.set(message.guild.id, cache);
        }

        return true;
      } else {
        logger.error(
          `Couldn't update settings for guild ${message.guild.name} - ${message.guild.id}.`,
        );
        return false;
      }
    }

    if (splitMsg[1] == 'disable') {
      const updateGuild = await databaseClient<IGuildSettings>(
        GuildSettingsTable,
      )
        .where({ guild_id: message.guild.id })
        .update({ smokemon_enabled: 0 });

      if (updateGuild) {
        logger.info(
          `SmokeMon disabled in ${message.guild.name} | ${message.guild.id}.`,
        );

        message.reply('SmokeMon disabled!');

        cache.settings.smokemon_enabled = 0;

        if (message.guild) {
          cacheClient.set(message.guild.id, cache);
        }

        return true;
      }
    }
  } else {
    logger.debug(
      `Not enough parameters for smokemon toggle in ${message.guild.name} | ${message.guild.id}.`,
    );
    return false;
  }
}
