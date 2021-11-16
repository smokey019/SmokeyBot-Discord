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
exports.toggleSmokeMon = void 0;
const discord_js_1 = require('discord.js');
const cache_1 = require('../../clients/cache');
const database_1 = require('../../clients/database');
const logger_1 = require('../../clients/logger');
const logger = (0, logger_1.getLogger)('Pokemon');
function toggleSmokeMon(message, cache) {
  var _a;
  return __awaiter(this, void 0, void 0, function* () {
    if (
      !message.member.permissions.has([
        discord_js_1.Permissions.FLAGS.ADMINISTRATOR,
      ])
    ) {
      return false;
    }
    const splitMsg = message.content.split(' ');
    if (splitMsg.length > 1) {
      if (splitMsg[1] == 'enable') {
        const monsterChannel =
          (_a = message.guild) === null || _a === void 0
            ? void 0
            : _a.channels.cache.find(
                (ch) => ch.name === cache.settings.specific_channel,
              );
        if (!monsterChannel) {
          yield message.reply(
            `You cannot enable smokeMon unless you have a channel called \`pokémon-spawns\` (with the special é). Make sure SmokeyBot has access to read/write in this channel as well.`,
          );
          return;
        }
        const updateGuild = yield (0, database_1.databaseClient)(
          database_1.GuildSettingsTable,
        )
          .where({ guild_id: message.guild.id })
          .update({ smokemon_enabled: 1 });
        if (updateGuild) {
          logger.info(
            `SmokeMon enabled in ${message.guild.name} | ${message.guild.id}.`,
          );
          message.reply(
            'smokeMon enabled! This plugin is for fun and SmokeyBot does not own the rights to any images/data and images/data are copyrighted by the Pokémon Company and its affiliates.',
          );
          cache.settings.smokemon_enabled = 1;
          if (message.guild) {
            cache_1.cacheClient.set(message.guild.id, cache);
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
        const updateGuild = yield (0, database_1.databaseClient)(
          database_1.GuildSettingsTable,
        )
          .where({ guild_id: message.guild.id })
          .update({ smokemon_enabled: 0 });
        if (updateGuild) {
          logger.info(
            `smokeMon disabled in ${message.guild.name} | ${message.guild.id}.`,
          );
          message.reply('smokeMon disabled!');
          cache.settings.smokemon_enabled = 0;
          if (message.guild) {
            cache_1.cacheClient.set(message.guild.id, cache);
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
  });
}
exports.toggleSmokeMon = toggleSmokeMon;
