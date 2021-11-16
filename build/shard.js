'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const discord_js_1 = require('discord.js');
const log4js_1 = require('log4js');
const config_1 = require('./config');
const manager = new discord_js_1.ShardingManager('./src/bot.ts', {
  token: (0, config_1.getConfigValue)('DISCORD_TOKEN'),
});
const logger = (0, log4js_1.getLogger)('DiscordClient');
manager.on('shardCreate', (shard) => logger.info(`Launched shard ${shard.id}`));
manager.spawn();
