import { Client, Intents, Message } from 'discord.js';
import { commands, loadCommands } from '../plugins/commands';
import { getAllMonsters, MonsterDex } from '../plugins/pokemon/monsters';
import { getPrefixes } from '../plugins/pokemon/parser';
import { MONSTER_SPAWNS, spawnMonster } from '../plugins/pokemon/spawn-monster';
import { format_number, getCurrentTime, getRndInteger } from '../utils';
import { getCache, getGCD, ICache } from './cache';
import { getGuildSettings, IGuildSettings } from './database';
import { getLogger } from './logger';
import { enableAP } from './top.gg';

const logger = getLogger('DiscordClient');
export let rateLimited = false;
export let initializing = true;

export const discordClient = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
  ],
  shards: 'auto',
});

discordClient.on('ready', async () => {
  logger.info(`Total MonsterPool: ${getAllMonsters().length}.`);
  logger.info(`Total Monsters: ${MonsterDex.size}.`);
  logger.info('Fully initialized.');
  initializing = false;
  await enableAP();
  await loadCommands();
});

discordClient.on('rateLimit', (error) => {
  const timeoutStr = error.timeout / 1000;
  logger.warn(
    `Rate Limited.. waiting ${format_number(
      Math.round(timeoutStr / 60),
    )} minutes.`,
  );

  rateLimited = true;

  setTimeout(() => {
    logger.warn('Rate limit timeout elapsed.');
    rateLimited = false;
  }, error.timeout);
});

discordClient.on('shardError', (error) => {
  console.error('A websocket connection encountered an error:', error);
});

discordClient.on('error', (error) => {
  console.error('Discord Client Error:', error);
});

discordClient.on('shardReady', (id: number) => {
  console.error(`Shard ${id} is ready.`);
});

discordClient.on('messageCreate', async (message) => {
  try {
    await parseMessage(message);
  } catch (error) {
    logger.error(error);
  }
});

async function parseMessage(message: Message) {
  if (
    !message.guild ||
    !message.member ||
    message.member.user.username == 'smokeybot' ||
    message.author.bot
  )
    return;

  const GCD = await getGCD(message.guild.id);
  const timestamp = getCurrentTime();
  const load_prefixes = await getPrefixes(message.guild.id);
  const prefixes = RegExp(load_prefixes.join('|'));
  const detect_prefix = message.content.match(prefixes);

  if (!detect_prefix || rateLimited || timestamp - GCD < 2) return;

  const prefix = detect_prefix.shift();

  const args = message.content
    .slice(prefix?.length)
    .trim()
    .toLowerCase()
    .replace(/ {2,}/gm, ' ')
    .split(/ +/);
  if (args.length < 1) return;

  const command = args.shift() ?? undefined;
  const commandFile = commands.find((_r, n) => n.includes(command));
  const settings: IGuildSettings = await getGuildSettings(message);
  const cache: ICache = await getCache(message, settings);

  if (cache && settings) {
    if (cache.settings.smokemon_enabled && !commandFile) {
      let spawn = await MONSTER_SPAWNS.get(message.guild.id);

      if (!spawn) {
        spawn = {
          monster: undefined,
          spawned_at: getCurrentTime() - 30,
        };
        MONSTER_SPAWNS.set(message.guild.id, spawn);
      } else {
        const spawn_timer = getRndInteger(getRndInteger(15, 120), 300);

        if (
          timestamp - spawn.spawned_at > spawn_timer &&
          !message.content.match(/catch/i) &&
          !message.content.match(/spawn/i) &&
          !rateLimited &&
          !initializing
        ) {
          await spawnMonster(message, cache);
        }
      }
    }
  }

  if (!commandFile) return;
  else
    commandFile({
      message,
      args,
      client: discordClient,
      dev: true,
      settings: settings,
      cache: cache,
    });
}
