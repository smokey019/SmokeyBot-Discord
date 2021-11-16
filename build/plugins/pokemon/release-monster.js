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
exports.recoverMonster = exports.releaseMonster = void 0;
const database_1 = require('../../clients/database');
const logger_1 = require('../../clients/logger');
const Monster_1 = require('../../models/Monster');
const utils_1 = require('../../utils');
const monsters_1 = require('./monsters');
const logger = (0, logger_1.getLogger)('Pokemon');
/**
 * Release a monster
 * @param monster_id
 * @returns true on success
 */
function release(monster_id) {
  return __awaiter(this, void 0, void 0, function* () {
    const released_monster = yield (0, database_1.databaseClient)(
      Monster_1.MonsterTable,
    )
      .where('id', monster_id)
      .update({ released: 1, released_at: Date.now() });
    if (released_monster) {
      logger.trace(`Successfully released a monster.`);
      return true;
    } else {
      return false;
    }
  });
}
/**
 * Recover a monster
 * @param monster_id
 * @returns true on success
 */
function recover(monster_id) {
  return __awaiter(this, void 0, void 0, function* () {
    const recover = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
      .where('id', monster_id)
      .update({ released: 0 });
    if (recover) {
      logger.trace(`Successfully recovered a monster.`);
      return true;
    } else {
      return false;
    }
  });
}
function releaseMonster(message) {
  return __awaiter(this, void 0, void 0, function* () {
    const tmpMsg = (0, utils_1.explode)(message.content, ' ', 2);
    if (tmpMsg.length > 1) {
      if (tmpMsg[1].toString().match(',') || tmpMsg[1].toString().match(' ')) {
        let multi_dump = [];
        if (tmpMsg[1].toString().match(',')) {
          multi_dump = tmpMsg[1].replace(' ', '').split(',');
        } else if (tmpMsg[1].toString().match(' ')) {
          multi_dump = tmpMsg[1].replace(',', '').split(' ');
        }
        if (multi_dump.length < 35) {
          multi_dump.forEach((element) =>
            __awaiter(this, void 0, void 0, function* () {
              if (isNaN(element)) return;
              const to_release = yield (0, monsters_1.getUserMonster)(element);
              if (!to_release) return;
              if (
                to_release &&
                !to_release.released &&
                to_release.uid == message.author.id
              ) {
                yield release(to_release.id);
              }
            }),
          );
          message
            .reply(
              `Attempting to release **${multi_dump.length}** monsters.. Good luck little guys :(`,
            )
            .then(() => {
              logger.info(
                `${message.author.username} Attempting to release your monsters.. Good luck little guys :(`,
              );
              return;
            })
            .catch((err) => {
              logger.error(err);
            });
        }
      } else {
        let to_release = undefined;
        if (tmpMsg[1] == '^') {
          const user = yield (0, database_1.getUser)(message.author.id);
          to_release = yield (0, monsters_1.getUserMonster)(
            user.latest_monster,
          );
        } else {
          if (isNaN(parseInt(tmpMsg[1]))) return;
          to_release = yield (0, monsters_1.getUserMonster)(tmpMsg[1]);
        }
        if (!to_release) return;
        if (
          !to_release.released &&
          to_release.uid == message.author.id &&
          !to_release.released
        ) {
          const monster = yield (0, monsters_1.findMonsterByID)(
            to_release.monster_id,
          );
          const released_monster = yield release(to_release.id);
          if (released_monster) {
            message
              .reply(
                `Successfully released your monster. Goodbye **${monster.name.english}** :(`,
              )
              .then(() => {
                logger.trace(`Successfully released monster. :(`);
                return;
              })
              .catch((err) => {
                logger.error(err);
              });
          }
        }
      }
    } else {
      message
        .reply(`Not enough things in ur msg there m8`)
        .then(() => {
          logger.debug(
            `${message.author.username} not enough things in ur msg there m8`,
          );
          return;
        })
        .catch((error) => logger.error(error));
    }
  });
}
exports.releaseMonster = releaseMonster;
function recoverMonster(message) {
  return __awaiter(this, void 0, void 0, function* () {
    const tmpMsg = message.content.split(' ');
    if (tmpMsg.length > 1) {
      const to_release = yield (0, monsters_1.getUserMonster)(tmpMsg[1]);
      if (
        to_release &&
        to_release.released &&
        to_release.uid == message.author.id
      ) {
        const monster = yield (0, monsters_1.findMonsterByID)(
          to_release.monster_id,
        );
        const released_monster = yield recover(to_release.id);
        if (released_monster) {
          message
            .reply(
              `Successfully recovered your monster. Welcome back **${monster.name.english}**!`,
            )
            .then(() => {
              logger.info(
                `${message.author.username} Successfully recovered **${monster.name.english}**!`,
              );
              return;
            })
            .catch((error) => logger.error(error));
        }
      }
    }
  });
}
exports.recoverMonster = recoverMonster;
