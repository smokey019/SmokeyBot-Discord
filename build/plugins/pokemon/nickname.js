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
exports.setNickname = void 0;
const database_1 = require('../../clients/database');
const Monster_1 = require('../../models/Monster');
const parser_1 = require('./parser');
function setNickname(message) {
  var _a, _b;
  return __awaiter(this, void 0, void 0, function* () {
    const load_prefixes = yield (0, parser_1.getPrefixes)(message.guild.id);
    const prefixes = RegExp(load_prefixes.join('|'));
    const detect_prefix = message.content.match(prefixes);
    const prefix = detect_prefix.shift();
    const args = message.content
      .slice(prefix.length)
      .replace(/ {2,}/gm, ' ')
      .split(/ +/);
    const command = args.shift();
    const user = yield (0, database_1.getUser)(message.author.id);
    // const monster = await getUserMonster(user.current_monster);
    if (
      ((_a = args[1]) === null || _a === void 0 ? void 0 : _a.trim()) &&
      command &&
      (user === null || user === void 0 ? void 0 : user.current_monster)
    ) {
      const updatedMonster = yield (0, database_1.databaseClient)(
        Monster_1.MonsterTable,
      )
        .where('id', user.current_monster)
        .update({ nickname: args[1] });
      if (updatedMonster) {
        message.reply('Nickname successfully set for your current monster!');
      } else {
        message.reply(
          'There was an error setting the nickname for your current monster.',
        );
      }
    } else if (
      !((_b = args[1]) === null || _b === void 0 ? void 0 : _b.trim())
    ) {
      message.reply('You have to set a valid nickname, idiot.');
    } else if (
      !(user === null || user === void 0 ? void 0 : user.current_monster)
    ) {
      message.reply(
        "You don't have a monster currently selected or no monsters caught.",
      );
    }
  });
}
exports.setNickname = setNickname;
