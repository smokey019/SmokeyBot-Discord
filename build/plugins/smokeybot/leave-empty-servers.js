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
exports.checkForEmptyServers = void 0;
const discord_1 = require("../../clients/discord");
const logger_1 = require("../../clients/logger");
const queue_1 = require("../../clients/queue");
const logger = (0, logger_1.getLogger)('SmokeyBot');
function checkForEmptyServers(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const all_guilds = discord_1.discordClient.guilds.cache;
        let leave_count = 0;
        let timeout = 5;
        all_guilds.forEach((element) => {
            if (element.memberCount < 5 && element.ownerId != '90514165138989056') {
                setTimeout(() => {
                    if (element.leave()) {
                        logger.debug(`${element.memberCount} - ${element.name} - Leaving server..`);
                    }
                }, timeout * 1000);
                timeout = timeout + 5;
                leave_count++;
            }
        });
        logger.info(`We're leaving ${leave_count} servers.`);
        (0, queue_1.queueMsg)(`We're leaving ${leave_count} servers.`, interaction, true);
    });
}
exports.checkForEmptyServers = checkForEmptyServers;
