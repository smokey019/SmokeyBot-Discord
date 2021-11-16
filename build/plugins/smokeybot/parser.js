'use strict';
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.smokeybotParser = void 0;
const cache_1 = require('../../clients/cache');
const logger_1 = require('../../clients/logger');
const queue_1 = require('../../clients/queue');
const utils_1 = require('../../utils');
const options_1 = require('../pokemon/options');
const parser_1 = require('../pokemon/parser');
const utils_2 = require('../pokemon/utils');
const sync_7tv_emotes_1 = require('./emote-sync/sync-7tv-emotes');
const sync_ffz_emotes_1 = require('./emote-sync/sync-ffz-emotes');
const leave_empty_servers_1 = require('./leave-empty-servers');
const smokeybot_1 = require('./smokeybot');
const logger = (0, logger_1.getLogger)('SmokeyBot');
function smokeybotParser(message, cache) {
  return __awaiter(this, void 0, void 0, function* () {
    if (!message.guild || !message.member) return;
    const load_prefixes = yield (0, parser_1.getPrefixes)(message.guild.id);
    const prefixes = RegExp(load_prefixes.join('|'));
    const detect_prefix = message.content.match(prefixes);
    if (!detect_prefix) return;
    const prefix = detect_prefix.shift();
    const args = message.content
      .slice(prefix === null || prefix === void 0 ? void 0 : prefix.length)
      .trim()
      .toLowerCase()
      .replace(/ {2,}/gm, ' ')
      .split(/ +/);
    const command = args.shift();
    if (command == prefix) {
      if (!message.member.permissions.has) return;
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, parser_1.set_prefix)(message);
    }
    if (
      command == 'clear' &&
      args[0] &&
      message.member.id == '90514165138989056'
    ) {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, cache_1.clearCache)(args[0]);
    }
    if (command == 'cachereport' && message.member.id == '90514165138989056') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, cache_1.reportCache)(message);
    }
    if (
      command == 'resetq' &&
      args[0] &&
      message.member.id == '90514165138989056'
    ) {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      (0, queue_1.resetQueue)(args[0], message);
    }
    if (
      command == 'smokemon' &&
      (args[0] == 'enable' || args[0] == 'disable')
    ) {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      if (!(yield (0, options_1.toggleSmokeMon)(message, cache))) {
        yield message.reply(
          'There was an error. You might not have permission to do this.',
        );
        logger.info(
          `${message.author.username} is improperly trying to enable smokemon in ${message.guild.name} - ${message.guild.id}`,
        );
      }
    }
    if (command === 'stats') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, utils_2.getBotStats)(message);
    }
    if (command === 'ping') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      const ping = Date.now() - message.createdTimestamp;
      yield message.reply(ping + ' ms');
    }
    if (command == 'help' || command == 'commands') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield message.reply(
        'For a list of commands check this link out: https://www.smokey.gg/tutorials/smokeybot-on-discord/',
      );
    }
    if (
      command == 'check-empty-servers' &&
      message.author.id == '90514165138989056'
    ) {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, leave_empty_servers_1.checkForEmptyServers)(message);
    }
    if (command == 'sync-emotes-ffz') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, sync_ffz_emotes_1.sync_ffz_emotes)(message);
    }
    if (command == 'sync-emotes-7tv') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, sync_7tv_emotes_1.sync_7tv_emotes)(message);
    }
    if (command == 'cancel-sync') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, sync_ffz_emotes_1.cancel_sync)(message);
    }
    if (message.content == '~check color roles') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      //await checkColorRoles(message);
    }
    if (message.content == '~remove color roles') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      //await removeColorRoles(message);
    }
    if (message.content == '~remove empty roles') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      //await removeEmptyRoles(message);
    }
    if (message.content == '~check tweet') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, smokeybot_1.checkTweet)(message);
    }
    if (command == 'smash') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, smokeybot_1.sumSmash)(message);
    }
    if (message.content == '~check vase') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, smokeybot_1.checkVase)(message);
    }
    if (command == 'gtfo') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield (0, smokeybot_1.gtfo)(message);
    }
    if (command == 'invite') {
      cache_1.GLOBAL_COOLDOWN.set(
        message.guild.id,
        (0, utils_1.getCurrentTime)(),
      );
      yield message.reply(
        `Here is Smokey's Discord Bot invite link: https://discord.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=268954696`,
      );
    }
  });
}
exports.smokeybotParser = smokeybotParser;
