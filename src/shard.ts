import { ShardingManager } from 'discord.js';
import { getLogger } from 'log4js';
import { getConfigValue } from './config';
const manager = new ShardingManager('./src/bot.ts', { token: getConfigValue('DISCORD_TOKEN') });

const logger = getLogger('DiscordClient');

manager.on('shardCreate', shard => logger.info(`Launched shard ${shard.id}`));
manager.spawn();
