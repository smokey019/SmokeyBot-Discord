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
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.checkVote = exports.dblCache = exports.dblClient = void 0;
const dblapi_js_1 = __importDefault(require('dblapi.js'));
const javascript_time_ago_1 = __importDefault(require('javascript-time-ago'));
const en_json_1 = __importDefault(
  require('javascript-time-ago/locale/en.json'),
);
const config_1 = require('../config');
const MonsterUser_1 = require('../models/MonsterUser');
const items_1 = require('../plugins/pokemon/items');
const cache_1 = require('./cache');
const database_1 = require('./database');
const discord_1 = require('./discord');
const logger_1 = require('./logger');
javascript_time_ago_1.default.addDefaultLocale(en_json_1.default);
const timeAgo = new javascript_time_ago_1.default('en-US');
exports.dblClient = new dblapi_js_1.default(
  (0, config_1.getConfigValue)('TOPGG_KEY'),
  discord_1.discordClient,
);
const logger = (0, logger_1.getLogger)('Top.GG Client');
exports.dblCache = (0, cache_1.loadCache)('dblCache');
const API_CACHE = (0, cache_1.loadCache)('API_CACHE');
exports.dblClient.on('error', (e) => {
  logger.error(`Oops! ${e}`);
});
function checkVote(message) {
  var _a;
  return __awaiter(this, void 0, void 0, function* () {
    const voted =
      (_a = yield exports.dblCache.get(message.author.id)) !== null &&
      _a !== void 0
        ? _a
        : {
            voted: false,
            checked_at: Date.now() - 86401337,
          };
    if (!voted.voted || Date.now() - voted.checked_at > 43200000) {
      const check = yield exports.dblClient.hasVoted(message.author.id);
      exports.dblCache.set(message.author.id, {
        voted: check,
        checked_at: Date.now(),
      });
      if (check) {
        const isWeekend = yield checkWeekend();
        if (isWeekend) {
          yield message.reply(
            `Thanks for voting! It's the weekend so you receive double! You received **5,000 currency** and **2 Rare Candy** to level up your monster(s)! You can do this every 12 hours.`,
          );
          for (let index = 0; index < 4; index++) {
            yield (0, items_1.createItemDB)({
              uid: message.author.id,
              item_number: 50,
            });
          }
          yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
            .where({ uid: message.author.id })
            .increment('currency', 5000);
          return true;
        } else {
          yield message.reply(
            `Thanks for voting! You received **2,500 currency** and a **Rare Candy** to level up a monster! You can do this every 12 hours.`,
          );
          yield (0, items_1.createItemDB)({
            uid: message.author.id,
            item_number: 50,
          });
          yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
            .where({ uid: message.author.id })
            .increment('currency', 2500);
          return true;
        }
      } else {
        yield message.reply(`you haven't voted yet, m8. WeirdChamp`);
        return false;
      }
    } else if (voted.voted) {
      yield message.reply(
        `you voted ${timeAgo.format(
          voted.checked_at,
        )} and got credit already. You can vote again ${timeAgo.format(
          voted.checked_at + 12 * 60 * 60 * 1000,
        )}.`,
      );
      return false;
    } else {
      logger.error('unknown top.gg error');
      return false;
    }
  });
}
exports.checkVote = checkVote;
function checkWeekend() {
  return __awaiter(this, void 0, void 0, function* () {
    const weekend = API_CACHE.get('weekend');
    if (!weekend) {
      const data = yield exports.dblClient.isWeekend();
      API_CACHE.set('weekend', { weekend: data, time: Date.now() });
      return data;
    } else {
      if (Date.now() - weekend.time > 60) {
        const data = yield exports.dblClient.isWeekend();
        API_CACHE.set('weekend', { weekend: data, time: Date.now() });
        return data;
      } else {
        return weekend.weekend;
      }
    }
  });
}
