"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDexes = void 0;
const database_1 = require("../../clients/database");
const MonsterUser_1 = require("../../models/MonsterUser");
const Monster_1 = require("../../models/Monster");
const logger_1 = require("../../clients/logger");
const logger = (0, logger_1.getLogger)('NEW DEX');
function updateDexes(message) {
    return __awaiter(this, void 0, void 0, function* () {
        if (message.author.id == '90514165138989056') {
            const users = yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable).select();
            if (users) {
                users.forEach((user) => __awaiter(this, void 0, void 0, function* () {
                    const monsters = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                        .select()
                        .where('uid', user.uid);
                    if (monsters) {
                        const newDex = [];
                        monsters.forEach((monster) => {
                            if (!newDex.includes(monster.monster_id)) {
                                newDex.push(monster.monster_id);
                            }
                        });
                        const updateUser = yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
                            .update('dex', JSON.stringify(newDex))
                            .where('id', user.id);
                        if (updateUser) {
                            logger.info('updated user dex');
                        }
                        else {
                            logger.info('eror updating dex');
                        }
                    }
                    {
                        logger.info('no monsters');
                    }
                }));
            }
        }
    });
}
exports.updateDexes = updateDexes;
