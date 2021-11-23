"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_1 = require("./clients/discord");
const logger_1 = require("./clients/logger");
const config_1 = require("./config");
const logger = (0, logger_1.getLogger)();
// Make sure we get a log of any exceptions that aren't checked
process.on('uncaughtException', (error) => {
    logger.error(error);
    throw error;
});
process.on('SIGINT', function () {
    console.log('\nGracefully shutting down from SIGINT (Ctrl-C)');
    // some other closing procedures go here
    process.exit(1);
});
process.on('unhandledRejection', (error) => {
    logger.error(error);
});
discord_1.discordClient.login((0, config_1.getConfigValue)('DISCORD_TOKEN'));
