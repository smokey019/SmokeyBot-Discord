import { Message } from 'discord.js';
import { clearCache, GLOBAL_COOLDOWN, ICache } from '../../clients/cache';
import { getLogger } from '../../clients/logger';
import { getCurrentTime } from '../../utils';
import { toggleSmokeMon } from '../pokemon/options';
import { getPrefixes, set_prefix } from '../pokemon/parser';
import { sync_7tv_emotes } from './emote-sync/sync-7tv-emotes';
import { cancel_sync, sync_ffz_emotes } from './emote-sync/sync-ffz-emotes';
import { checkForEmptyServers } from './leave-empty-servers';
import { checkTweet, checkVase, gtfo, sumSmash } from './smokeybot';

const logger = getLogger('SmokeyBot');

export async function smokeybotParser(
  message: Message,
  cache: ICache,
): Promise<void> {
  const load_prefixes = await getPrefixes(message.guild.id);
  const prefixes = RegExp(load_prefixes.join('|'));
  const detect_prefix = message.content.match(prefixes);
  if (!detect_prefix) return;
  const prefix = detect_prefix.shift();
  const args = message.content
    .slice(prefix.length)
    .trim()
    .toLowerCase()
    .replace(/ {2,}/gm, ' ')
    .split(/ +/);
  const command = args.shift();

  if (command == prefix) {
    if (!message.member.permissions.has) return;
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
    await set_prefix(message);
  }

  if (
    command == 'clear' &&
    args[0] &&
    message.member.id == '90514165138989056'
  ) {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await clearCache(args[0]);
  }

  if (command == 'smokemon' && (args[0] == 'enable' || args[0] == 'disable')) {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    if (!(await toggleSmokeMon(message, cache))) {
      await message.reply(
        'There was an error. You might not have permission to do this.',
      );
      logger.info(
        `${message.author.username} is improperly trying to enable smokemon in ${message.guild.name} - ${message.guild.id}`,
      );
    }
  }

  if (command === 'ping') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    const ping = Date.now() - message.createdTimestamp;
    await message.reply(ping + ' ms');
  }

  if (command == 'help' || command == 'commands') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await message.reply(
      'For a list of commands check this link out: https://www.smokey.gg/tutorials/smokeybot-on-discord/',
    );
  }

  if (
    command == 'check-empty-servers' &&
    message.author.id == '90514165138989056'
  ) {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
    await checkForEmptyServers(message);
  }

  if (command == 'sync-emotes-ffz') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await sync_ffz_emotes(message);
  }

  if (command == 'sync-emotes-7tv') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await sync_7tv_emotes(message);
  }

  if (command == 'cancel-sync') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await cancel_sync(message);
  }

  if (message.content == '~check color roles') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    //await checkColorRoles(message);
  }

  if (message.content == '~remove color roles') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    //await removeColorRoles(message);
  }

  if (message.content == '~remove empty roles') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    //await removeEmptyRoles(message);
  }

  if (message.content == '~check tweet') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await checkTweet(message);
  }

  if (command == 'smash') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await sumSmash(message);
  }

  if (message.content == '~check vase') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await checkVase(message);
  }

  if (command == 'gtfo') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await gtfo(message);
  }

  if (command == 'invite') {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    await message.reply(
      `Here is Smokey's Discord Bot invite link: https://discord.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=268954696`,
    );
  }
}
