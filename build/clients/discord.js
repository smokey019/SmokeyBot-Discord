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
exports.discordClient = exports.initializing = exports.rateLimited = void 0;
const discord_js_1 = require('discord.js');
const monsters_1 = require('../plugins/pokemon/monsters');
const parser_1 = require('../plugins/pokemon/parser');
const spawn_monster_1 = require('../plugins/pokemon/spawn-monster');
const parser_2 = require('../plugins/smokeybot/parser');
const utils_1 = require('../utils');
const cache_1 = require('./cache');
const database_1 = require('./database');
const logger_1 = require('./logger');
const top_gg_1 = require('./top.gg');
const logger = (0, logger_1.getLogger)('DiscordClient');
exports.rateLimited = false;
exports.initializing = true;
exports.discordClient = new discord_js_1.Client({
  intents: [
    discord_js_1.Intents.FLAGS.GUILDS,
    discord_js_1.Intents.FLAGS.GUILD_MESSAGES,
    discord_js_1.Intents.FLAGS.DIRECT_MESSAGES,
    discord_js_1.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
  ],
  shards: 'auto',
});
exports.discordClient.on('ready', () =>
  __awaiter(void 0, void 0, void 0, function* () {
    logger.info(
      `Total MonsterPool: ${(0, monsters_1.getAllMonsters)().length}.`,
    );
    logger.info(`Total Monsters: ${monsters_1.MonsterDex.size}.`);
    logger.info('Fully initialized.');
    exports.initializing = false;
    setInterval(
      () =>
        __awaiter(void 0, void 0, void 0, function* () {
          yield top_gg_1.dblClient.postStats(
            exports.discordClient.guilds.cache.size,
          );
        }),
      1800000,
    );
  }),
);
exports.discordClient.on('rateLimit', (error) => {
  const timeoutStr = error.timeout / 1000;
  logger.warn(
    `Rate Limited.. waiting ${(0, utils_1.format_number)(
      Math.round(timeoutStr / 60),
    )} minutes.`,
  );
  exports.rateLimited = true;
  setTimeout(() => {
    logger.warn('Rate limit timeout elapsed.');
    exports.rateLimited = false;
  }, error.timeout);
});
exports.discordClient.on('shardError', (error) => {
  console.error('A websocket connection encountered an error:', error);
});
exports.discordClient.on('error', (error) => {
  console.error('Discord Client Error:', error);
});
exports.discordClient.on('shardReady', (id) => {
  console.error(`Shard ${id} is ready.`);
});
exports.discordClient.on('messageCreate', (message) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      yield parseMessage(message);
    } catch (error) {
      logger.error(error);
    }
  }),
);
function parseMessage(message) {
  return __awaiter(this, void 0, void 0, function* () {
    const timestamp = (0, utils_1.getCurrentTime)();
    if (
      !message.member ||
      message.member.user.username == 'smokeybot' ||
      exports.rateLimited ||
      message.author.bot
    ) {
      return;
    }
    const settings = yield (0, database_1.getGuildSettings)(message);
    const cache = yield (0, cache_1.getCache)(message, settings);
    const GCD = yield (0, cache_1.getGCD)(message.guild.id);
    if (cache && settings) {
      if (timestamp - GCD > 5) {
        yield (0, parser_2.smokeybotParser)(message, cache);
      }
      if (cache.settings.smokemon_enabled) {
        let spawn = yield spawn_monster_1.MONSTER_SPAWNS.get(message.guild.id);
        if (!spawn) {
          spawn = {
            monster: undefined,
            spawned_at: (0, utils_1.getCurrentTime)() - 30,
          };
          spawn_monster_1.MONSTER_SPAWNS.set(message.guild.id, spawn);
          yield (0, parser_1.monsterParser)(message, cache);
        } else {
          const spawn_timer = (0, utils_1.getRndInteger)(
            (0, utils_1.getRndInteger)(15, 120),
            300,
          );
          if (
            timestamp - spawn.spawned_at > spawn_timer &&
            !message.content.match(/catch/i) &&
            !message.content.match(/spawn/i) &&
            !exports.rateLimited &&
            !exports.initializing
          ) {
            yield (0, spawn_monster_1.spawnMonster)(message, cache);
          }
          yield (0, parser_1.monsterParser)(message, cache);
        }
      }
    } else if (!cache) {
      logger.error(
        `Missing cache for ${message.guild.id} - ${message.guild.name}.`,
      );
    } else if (!settings) {
      logger.error(
        `Missing settings for ${message.guild.id} - ${message.guild.name}.`,
      );
    }
  });
}
