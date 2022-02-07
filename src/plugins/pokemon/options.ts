import { CommandInteraction, Permissions, PermissionString } from 'discord.js';
import { cacheClient, ICache } from '../../clients/cache';
import {
    databaseClient,
    GuildSettingsTable,
    IGuildSettings
} from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';

const logger = getLogger('Pokémon');

export async function toggleSmokeMon(
  interaction: CommandInteraction,
  args: string[],
  cache: ICache,
): Promise<boolean | void> {
  const userPerms = new Permissions(
    interaction.member.permissions as PermissionString,
  );

  if (!userPerms.has(Permissions.FLAGS.ADMINISTRATOR)) return;

  const splitMsg = args;

  if (splitMsg.length > 1) {
    if (splitMsg[1] == 'enable') {
      const monsterChannel = interaction.guild?.channels.cache.find(
        (ch) => ch.name === cache.settings.specific_channel,
      );

      if (!monsterChannel) {
        queueMsg(
          `You cannot enable smokeMon unless you have a channel called \`pokémon-spawns\` (with the special é). Make sure SmokeyBot has access to read/write in this channel as well.`,
          interaction,
          true,
          1,
        );
        return;
      }

      const updateGuild = await databaseClient<IGuildSettings>(
        GuildSettingsTable,
      )
        .where({ guild_id: interaction.guild.id })
        .update({ smokemon_enabled: 1 });

      if (updateGuild) {
        logger.info(
          `SmokeMon enabled in ${interaction.guild.name} | ${interaction.guild.id}.`,
        );

        queueMsg(
          'smokeMon enabled! This plugin is for fun and SmokeyBot does not own the rights to any images/data and images/data are copyrighted by the Pokémon Company and its affiliates.',
          interaction,
          true,
          1,
        );

        cache.settings.smokemon_enabled = 1;

        if (interaction.guild) {
          cacheClient.set(interaction.guild.id, cache);
        }

        return true;
      } else {
        logger.error(
          `Couldn't update settings for guild ${interaction.guild.name} - ${interaction.guild.id}.`,
        );
        return false;
      }
    }

    if (splitMsg[1] == 'disable') {
      const updateGuild = await databaseClient<IGuildSettings>(
        GuildSettingsTable,
      )
        .where({ guild_id: interaction.guild.id })
        .update({ smokemon_enabled: 0 });

      if (updateGuild) {
        logger.info(
          `smokeMon disabled in ${interaction.guild.name} | ${interaction.guild.id}.`,
        );

        queueMsg('smokeMon disabled!', interaction, true, 1);

        cache.settings.smokemon_enabled = 0;

        if (interaction.guild) {
          cacheClient.set(interaction.guild.id, cache);
        }

        return true;
      }
    }
  } else {
    logger.debug(
      `Not enough parameters for smokemon toggle in ${interaction.guild.name} | ${interaction.guild.id}.`,
    );
    return false;
  }
}
