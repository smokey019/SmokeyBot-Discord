import { Message, Permissions } from 'discord.js';
import { cacheClient, ICache } from '../../clients/cache';
import {
  databaseClient,
  GuildSettingsTable,
  IGuildSettings,
} from '../../clients/database';
import { getLogger } from '../../clients/logger';

const logger = getLogger('Pokemon');

export async function toggleSmokeMon(
  message: Message,
  cache: ICache,
): Promise<boolean | void> {
  if (!message.member.permissions.has([Permissions.FLAGS.ADMINISTRATOR])) {
    return false;
  }

  const splitMsg = message.content.split(' ');

  if (splitMsg.length > 1) {
    if (splitMsg[1] == 'enable') {
      const monsterChannel = message.guild?.channels.cache.find(
        (ch) => ch.name === cache.settings.specific_channel,
      );

      if (!monsterChannel) {
        await message.reply(
          `You cannot enable smokeMon unless you have a channel called \`pokémon-spawns\` (with the special é). Make sure SmokeyBot has access to read/write in this channel as well.`,
        );
        return;
      }

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
