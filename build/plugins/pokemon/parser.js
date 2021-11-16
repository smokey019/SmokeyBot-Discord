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
exports.prefix_check =
  exports.set_prefix =
  exports.updatePrefixes =
  exports.getPrefixes =
  exports.monsterParser =
  exports.default_prefixes =
    void 0;
const cache_1 = require('../../clients/cache');
const database_1 = require('../../clients/database');
const top_gg_1 = require('../../clients/top.gg');
const utils_1 = require('../../utils');
const battle_1 = require('./battle');
const catch_monster_1 = require('./catch-monster');
const check_monsters_1 = require('./check-monsters');
const exp_gain_1 = require('./exp-gain');
const info_1 = require('./info');
const items_1 = require('./items');
const leaderboard_1 = require('./leaderboard');
const monsters_1 = require('./monsters');
const nickname_1 = require('./nickname');
const release_monster_1 = require('./release-monster');
const spawn_monster_1 = require('./spawn-monster');
const trading_1 = require('./trading');
const utils_2 = require('./utils');
exports.default_prefixes = ['!', '~', 'p!'];
function monsterParser(message, cache) {
  var _a;
  return __awaiter(this, void 0, void 0, function* () {
    yield (0, exp_gain_1.checkExpGain)(message);
    if (!message.guild || !message.member) return;
    const channel_name = message.channel.name;
    const GCD = yield (0, cache_1.getGCD)(message.guild.id);
    const timestamp = (0, utils_1.getCurrentTime)();
    const spawn = yield spawn_monster_1.MONSTER_SPAWNS.get(message.guild.id);
    const load_prefixes = yield getPrefixes(message.guild.id);
    const prefixes = RegExp(load_prefixes.join('|'));
    const detect_prefix = message.content.match(prefixes);
    if (channel_name != cache.settings.specific_channel || !detect_prefix)
      return;
    const prefix = detect_prefix.shift();
    const args = message.content
      .slice(prefix === null || prefix === void 0 ? void 0 : prefix.length)
      .trim()
      .toLowerCase()
      .replace(/ {2,}/gm, ' ')
      .split(/ +/);
    const command = args.shift();
    if (
      spawn.monster &&
      args &&
      (command == 'catch' ||
        command == 'キャッチ' ||
        command == '抓住' ||
        command == 'capture')
    ) {
      yield (0, catch_monster_1.catchMonster)(message, cache);
    } else if (timestamp - GCD > 3) {
      switch (command) {
        case 'unique':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, info_1.checkUniqueMonsters)(message);
          break;
        case 'leaderboard':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, leaderboard_1.checkLeaderboard)(message);
          break;
        case 'bal':
        case 'balance':
        case 'currency':
        case 'bank':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, items_1.msgBalance)(message);
          break;
        case 'weather':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, utils_2.checkServerWeather)(message, cache);
          break;
        case 'nickname':
        case 'nick':
          if (args[0] == 'set') {
            cache_1.GLOBAL_COOLDOWN.set(
              message.guild.id,
              (0, utils_1.getCurrentTime)(),
            );
            yield (0, nickname_1.setNickname)(message);
          }
          break;
        case 'vote':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, utils_2.voteCommand)(message);
          break;
        case 'check-vote':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, top_gg_1.checkVote)(message);
          break;
        case 'pokedex':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, check_monsters_1.checkPokedex)(message);
          break;
        case 'item':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, items_1.parseItems)(message);
          break;
        case 'trade':
        case 't':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, trading_1.parseTrade)(message);
          break;
        case 'dex':
        case 'd':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, info_1.monsterDex)(message);
          break;
        case 'search':
        case 's':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, check_monsters_1.searchMonsters)(message);
          break;
        case 'pokemon':
        case 'p':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, check_monsters_1.checkMonsters)(message);
          break;
        case 'spawn':
          if (message.author.id == '90514165138989056') {
            yield (0, spawn_monster_1.spawnMonster)(message, cache);
          }
          break;
        case 'fspawn':
          if (message.author.id == '90514165138989056') {
            yield (0, spawn_monster_1.forceSpawn)(message, cache);
          }
          break;
        case 'info':
        case 'i':
          if (
            (_a = args[0]) === null || _a === void 0 ? void 0 : _a.match(/\d+/)
          ) {
            cache_1.GLOBAL_COOLDOWN.set(
              message.guild.id,
              (0, utils_1.getCurrentTime)(),
            );
            yield (0, info_1.monsterInfo)(message);
          } else if (args.length == 0) {
            cache_1.GLOBAL_COOLDOWN.set(
              message.guild.id,
              (0, utils_1.getCurrentTime)(),
            );
            yield (0, info_1.currentMonsterInfo)(message);
          } else if (args[0] == 'latest' || args[0] == 'l') {
            cache_1.GLOBAL_COOLDOWN.set(
              message.guild.id,
              (0, utils_1.getCurrentTime)(),
            );
            yield (0, info_1.monsterInfoLatest)(message);
          }
          break;
        case 'ib':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, info_1.currentMonsterInfoBETA)(message);
          break;
        case 'release':
        case 'r':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, release_monster_1.releaseMonster)(message);
          break;
        case 'recover':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, release_monster_1.recoverMonster)(message);
          break;
        case 'select':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, monsters_1.selectMonster)(message);
          break;
        case 'favorites':
        case 'favourites':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, check_monsters_1.checkFavorites)(message);
          break;
        case 'favorite':
        case 'favourite':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, monsters_1.setFavorite)(message);
          break;
        case 'unfavorite':
        case 'unfavourite':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, monsters_1.unFavorite)(message);
          break;
        case 'battle':
          cache_1.GLOBAL_COOLDOWN.set(
            message.guild.id,
            (0, utils_1.getCurrentTime)(),
          );
          yield (0, battle_1.battleParser)(message);
          break;
      }
    }
  });
}
exports.monsterParser = monsterParser;
/**
 * Retrieve Guild Prefixes
 * Default: ['!', '~', 'p!']
 * @param guild_id message.guild.id
 * @returns ['!', '~', 'p!'] or more.
 */
function getPrefixes(guild_id) {
  return __awaiter(this, void 0, void 0, function* () {
    const data = yield (0, database_1.databaseClient)('guild_settings')
      .where({
        guild_id: guild_id,
      })
      .select('prefixes')
      .first();
    return JSON.parse(data.prefixes);
  });
}
exports.getPrefixes = getPrefixes;
/**
 * Update a Guild's Prefixes
 * @param guild_id
 * @param prefixes
 * @returns
 */
function updatePrefixes(guild_id, prefixes) {
  return __awaiter(this, void 0, void 0, function* () {
    return yield (0, database_1.databaseClient)('guild_settings')
      .where({
        guild_id: guild_id,
      })
      .update({
        prefixes: JSON.stringify(prefixes),
      });
  });
}
exports.updatePrefixes = updatePrefixes;
function set_prefix(message) {
  return __awaiter(this, void 0, void 0, function* () {
    let i = 0;
    const parse = yield (0, utils_2.parseArgs)(message);
    const prefixes = yield getPrefixes(message.guild.id);
    if (!parse.args[1] || (!parse.args[2] && parse.args[1] != 'default')) {
      yield message.reply(
        'Not enough parameters. Example: `!prefix enable !`. Type `!prefix help` for more information.',
      );
      return;
    }
    if (parse.args[1] == 'enable') {
      switch (parse.args[2]) {
        case '!':
          if (!prefixes.includes('!')) {
            prefixes.push('!');
            yield updatePrefixes(message.guild.id, prefixes);
            yield message.reply(
              'Successfully added `!` as a prefix. Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
          }
          break;
        case '?':
          if (!prefixes.includes('\\?')) {
            prefixes.push('\\?');
            yield updatePrefixes(message.guild.id, prefixes);
            yield message.reply(
              'Successfully added `?` as a prefix.  Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
          }
          break;
        case '~':
          if (!prefixes.includes('~')) {
            prefixes.push('~');
            yield updatePrefixes(message.guild.id, prefixes);
            yield message.reply(
              'Successfully added `~` as a prefix.  Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
          }
          break;
        case 'p!':
          if (!prefixes.includes('p!')) {
            prefixes.push('p!');
            yield updatePrefixes(message.guild.id, prefixes);
            yield message.reply(
              'Successfully added `p!` as a prefix.  Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
          }
          break;
        default:
          yield message.reply(
            'You can enable/disable these prefixes: ' + prefixes,
          );
          break;
      }
    } else if (parse.args[1] == 'disable') {
      switch (parse.args[2]) {
        case '!':
          if (prefixes.includes('!') && prefixes.length > 1) {
            for (i = 0; i < prefixes.length; i++) {
              if (prefixes[i] === '!') {
                prefixes.splice(i, 1);
              }
            }
            yield message.reply(
              'Successfully removed `!` as a prefix.  Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
            yield updatePrefixes(message.guild.id, prefixes);
          }
          break;
        case '?':
          if (prefixes.includes('\\?') && prefixes.length > 1) {
            for (i = 0; i < prefixes.length; i++) {
              if (prefixes[i] === '\\?') {
                prefixes.splice(i, 1);
              }
            }
            yield message.reply(
              'Successfully removed `?` as a prefix.  Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
            yield updatePrefixes(message.guild.id, prefixes);
          }
          break;
        case '~':
          if (prefixes.includes('~') && prefixes.length > 1) {
            for (i = 0; i < prefixes.length; i++) {
              if (prefixes[i] === '~') {
                prefixes.splice(i, 1);
              }
            }
            yield message.reply(
              'Successfully removed `~` as a prefix.  Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
            yield updatePrefixes(message.guild.id, prefixes);
          }
          break;
        case 'p!':
          if (prefixes.includes('p!') && prefixes.length > 1) {
            for (i = 0; i < prefixes.length; i++) {
              if (prefixes[i] === 'p!') {
                prefixes.splice(i, 1);
              }
            }
            yield message.reply(
              'Successfully removed `p!` as a prefix.  Your prefixes are now: `' +
                prefixes.join(' ') +
                '`.',
            );
            yield updatePrefixes(message.guild.id, prefixes);
          }
          break;
        default:
          yield message.reply(
            'You can enable/disable these prefixes: ' + prefixes,
          );
          break;
      }
    } else if (parse.args[1] == 'default') {
      yield updatePrefixes(message.guild.id, exports.default_prefixes);
      yield message.reply(
        'Successfully reset prefixes back to default: ' +
          exports.default_prefixes.join(', '),
      );
    } else if (parse.args[1] == 'help') {
      yield message.reply(
        'Enable/disable prefixes: `!prefix disable ~` or `!prefix enable p!`. By default SmokeyBot uses: `' +
          exports.default_prefixes.join(' ') +
          '`.',
      );
    }
  });
}
exports.set_prefix = set_prefix;
function prefix_check(message) {
  return __awaiter(this, void 0, void 0, function* () {
    const prefixes = yield getPrefixes(message.guild.id);
    if (prefixes.includes(message.content.charAt(0))) {
      return true;
    } else {
      return false;
    }
  });
}
exports.prefix_check = prefix_check;
