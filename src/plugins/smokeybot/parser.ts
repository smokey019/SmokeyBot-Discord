import { Message } from 'discord.js';
import { getCurrentTime } from '../../utils';
import { ICache, GLOBAL_COOLDOWN } from '../../clients/cache';
import { toggleSmokeMon } from '../pokemon/options';
import { sync_smokemotes, sync_ffz_emotes } from './sync-emojis';
import { getLogger } from '../../clients/logger';
import {
  sumSmash,
  checkVase,
  gtfo,
  checkColorRoles,
  removeEmptyRoles,
  checkTweet,
  removeColorRoles,
} from './smokeybot';
import { prefix_regex } from '../pokemon/parser';
import { checkForEmptyServers } from './leave-empty-servers';

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
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      if (!toggleSmokeMon(message, cache)) {
        await message.reply(
          'There was an error. You might not have permission to do this.',
        );
        logger.info(
          `${message.author.username} is improperly trying to enable smokemon in ${message.guild.name} - ${message.guild.id}`,
        );
      }
    }
  }

  if (splitMsg[0].match(prefix_regex('help|commands'))) {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await message.reply(
      'for a list of commands check this link out: https://www.smokey.gg/tutorials/smokeybot-on-discord/',
    );
  }

  if (
    splitMsg[0].toLowerCase() == '~check-empty-servers' &&
    message.author.id == '90514165138989056'
  ) {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
    await checkForEmptyServers(message);
  }

  if (splitMsg[0].toLowerCase() == '~sync-emotes-smokemotes') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
    await sync_smokemotes(message);
  }

  if (splitMsg[0].toLowerCase() == '~sync-emotes-ffz') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await sync_ffz_emotes(message);
  }

  if (message.content == '~check color roles') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await checkColorRoles(message);
  }

  if (message.content == '~remove color roles') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await removeColorRoles(message);
  }

  if (message.content == '~remove empty roles') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await removeEmptyRoles(message);
  }

  if (message.content == '~check tweet') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await checkTweet(message);
  }

  if (splitMsg[0].toLowerCase() == '~smash') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await sumSmash(message);
  }

  if (message.content == '~check vase') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await checkVase(message);
  }

  if (splitMsg[0].toLowerCase() == '~gtfo') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await gtfo(message);
  }

  if (splitMsg[0].toLowerCase() == '~invite') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await message.reply(
      `here is Smokey's Discord Bot invite link: https://discord.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=268954696`,
    );
  }
}
