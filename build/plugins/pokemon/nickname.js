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
exports.setNickname = void 0;
const database_1 = require("../../clients/database");
const queue_1 = require("../../clients/queue");
const Monster_1 = require("../../models/Monster");
function setNickname(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const nick = interaction.options.getString('pokemon');
        const user = yield (0, database_1.getUser)(interaction.user.id);
        if (nick.trim() && user.current_monster) {
            const updatedMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .where('id', user.current_monster)
                .update({ nickname: nick });
            if (updatedMonster) {
                (0, queue_1.queueMsg)('Nickname successfully set for your current monster!', interaction, true);
            }
            else {
                (0, queue_1.queueMsg)('There was an error setting the nickname for your current monster.', interaction, true);
            }
        }
        else if (!(nick === null || nick === void 0 ? void 0 : nick.trim())) {
            (0, queue_1.queueMsg)('You have to set a valid nickname, idiot.', interaction, true);
        }
        else if (!(user === null || user === void 0 ? void 0 : user.current_monster)) {
            (0, queue_1.queueMsg)("You don't have a monster currently selected or no monsters caught.", interaction, true);
        }
    });
}
exports.setNickname = setNickname;
