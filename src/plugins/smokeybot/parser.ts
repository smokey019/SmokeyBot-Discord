import { Message } from 'discord.js';
import { getCurrentTime } from '../../utils';
import { cacheClient, ICache } from '../../clients/cache';
import { toggleSmokeMon } from '../pokemon/options';
import { sync_smokemotes, sync_ffz_emotes } from './smokeybot';
import { getLogger } from '../../clients/logger';

const logger = getLogger('SmokeyBot');

export async function smokeybotParser(
  message: Message,
  cache: ICache,
): Promise<any> {
  const splitMsg = message.content.split(' ') || message.content;

  if (
    message.content.match(/~smokemon (enable|disable)/i) &&
    splitMsg[0].toLowerCase() == '~smokemon'
  ) {
    if (
      (splitMsg[1].toLowerCase() == 'enable' &&
        !cache.settings.smokemon_enabled) ||
      (splitMsg[1].toLowerCase() == 'disable' &&
        cache.settings.smokemon_enabled)
    ) {
      cache.time = getCurrentTime();

      cacheClient.set(message.guild.id, {
        ...cache,
        time: getCurrentTime(),
      });
      if (!toggleSmokeMon(message, cache)) {
        message.reply(
          'There was an error. You might not have permission to do this.',
        );
        logger.info(
          `${message.author.username} is improperly trying to enable smokemon in ${message.guild.name} - ${message.guild.id}`,
        );
      }
    }
  }

  if (splitMsg[0].toLowerCase() == '~sync-emotes-smokemotes') {
    cache.time = getCurrentTime();

    cacheClient.set(message.guild.id, {
      ...cache,
      time: getCurrentTime(),
    });

    sync_smokemotes(message);
  }

  if (splitMsg[0].toLowerCase() == '~sync-emotes-ffz') {
    cache.time = getCurrentTime();

    cacheClient.set(message.guild.id, {
      ...cache,
      time: getCurrentTime(),
    });

    sync_ffz_emotes(message);
  }

  if (splitMsg[0].toLowerCase() == '~invite') {
    cache.time = getCurrentTime();

    cacheClient.set(message.guild.id, {
      ...cache,
      time: getCurrentTime(),
    });

    message.reply(
      `here is Smokey's Discord Bot invite link: https://discordapp.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=8`,
    );
  }
}
