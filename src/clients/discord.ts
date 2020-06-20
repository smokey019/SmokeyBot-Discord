import { Client, Message, TextChannel } from 'discord.js';
import { getLogger } from './logger';
import { cacheClient, ICache } from './cache';
import { getGuildSettings, putGuildSettings, IGuildSettings } from './database';
import {
  checkMonsters,
  checkFavorites,
} from '../plugins/pokemon/check-monsters';
import {
  monsterInfo,
  monsterInfoLatest,
  monsterDex,
  userDex,
  currentMonsterInfo,
} from '../plugins/pokemon/info';
import { getCurrentTime, getRndInteger, theWord } from '../utils';
import { spawnMonster } from '../plugins/pokemon/spawn-monster';
import { catchMonster } from '../plugins/pokemon/catch-monster';
import { releaseMonster } from '../plugins/pokemon/release-monster';
import { toggleSmokeMon } from '../plugins/pokemon/options';
import {
  sync_smokemotes,
  sync_ffz_emotes,
} from '../plugins/smokeybot/smokeybot';
import { checkExpGain } from '../plugins/pokemon/exp-gain';
import {
  selectMonster,
  setFavorite,
  unFavorite,
} from '../plugins/pokemon/monsters';

const logger = getLogger('DiscordClient');
let rateLimited = false;
const do_not_cache = [];

export const discordClient = new Client({ retryLimit: 5 });

discordClient.on('ready', () => {
  logger.info('Ready');
});

discordClient.on('rateLimit', (error) => {
  logger.warn('Rate Limited', error);

  rateLimited = true;

  setTimeout(() => {
    logger.info('Rate limit timeout elapsed.');
    rateLimited = false;
  }, error.timeout);
});

discordClient.on('message', async (message) => {
  try {
    await parseMessage(message);
  } catch (error) {
    logger.error(error);
  }
});

async function parseMessage(message: Message) {
  const timestamp = getCurrentTime();

  const channel_name = (message.channel as TextChannel).name;

  if (
    !message.member ||
    message.member.user.username == 'smokeybot' ||
    rateLimited
  ) {
    return;
  }

  const cache: ICache =
    message.guild != null ? await cacheClient.get(message.guild.id) : undefined;

  if (cache == null) {
    if (!do_not_cache.includes(message.guild?.id)) {
      do_not_cache.push(message.guild?.id);

      const settings: IGuildSettings =
        message.guild != null
          ? await getGuildSettings(message.guild.id)
          : undefined;

      if (settings == null) {
        putGuildSettings(message);
      } else {
        message.guild != null
          ? cacheClient.set(message.guild.id, {
              tweet: [],
              monster_spawn: {
                current_spawn: undefined,
                last_spawn: undefined,
                last_spawn_time: timestamp,
                msg: message,
              },
              settings: {
                id: settings.id,
                guild_id: settings.guild_id,
                smokemon_enabled: settings.smokemon_enabled,
                specific_channel: settings.specific_channel,
              },
              time: timestamp,
            })
          : undefined;

        logger.info(`Initialized cache for ${message.guild.name}.`);
      }
    }
  } else {
    if (timestamp - cache.time > 3) {
      const splitMsg = message.content.split(' ') || message.content;

      if (
        message.content.match(/~smokemon (enable|disable)/i) &&
        splitMsg[0].toLowerCase() == '~smokemon'
      ) {
        if (
          (splitMsg[1].toLowerCase() == 'enable' &&
            !cache.settings.smokemon_enabled) ||
          (splitMsg[1].toLowerCase() == 'disable' &&
            cache.settings.smokemon_enabled)
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });
          if (!toggleSmokeMon(message, cache)) {
            message.reply(
              'There was an error. You might not have permission to do this.',
            );
            logger.info(
              `${message.author.username} is improperly trying to enable smokemon in ${message.guild.name} - ${message.guild.id}`,
            );
          }
        }
      }

      if (splitMsg[0].toLowerCase() == '~sync-emotes-smokemotes') {
        cache.time = getCurrentTime();

        cacheClient.set(message.guild.id, {
          ...cache,
          time: getCurrentTime(),
        });

        sync_smokemotes(message);
      }

      if (splitMsg[0].toLowerCase() == '~sync-emotes-ffz') {
        cache.time = getCurrentTime();

        cacheClient.set(message.guild.id, {
          ...cache,
          time: getCurrentTime(),
        });

        sync_ffz_emotes(message);
      }

      if (splitMsg[0].toLowerCase() == '~invite') {
        cache.time = getCurrentTime();

        cacheClient.set(message.guild.id, {
          ...cache,
          time: getCurrentTime(),
        });

        message.reply(
          `here is Smokey's Discord Bot invite link: https://discordapp.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=8`,
        );
      }
    }

    if (cache.settings.smokemon_enabled) {
      const splitMsg = message.content.split(' ') || message.content;

      if (
        cache.monster_spawn.current_spawn &&
        message.content.match(/~catch/i) &&
        splitMsg[0].toLowerCase() == '~catch' &&
        channel_name == cache.settings.specific_channel &&
        splitMsg.length > 1
      ) {
        catchMonster(message, cache);
      }

      if (timestamp - cache.time > 3) {
        if (
          message.content.match(/~unique/i) &&
          splitMsg[0].toLowerCase() == '~unique'
        ) {
          const tempdex = await userDex(message);
          message.reply(
            `You have ${
              tempdex.length
            } total unique ${theWord()} in your Pokédex.`,
          );
        }

        if (
          message.content.match(/~dex/i) &&
          splitMsg[0].toLowerCase() == '~dex' &&
          channel_name == cache.settings.specific_channel &&
          splitMsg.length > 1
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          monsterDex(message);
        }
        if (
          splitMsg[0].toLowerCase() == '~pokemon' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          checkMonsters(message);
        }

        if (
          message.content.match(/~info (\d+)/i) &&
          splitMsg[0] == '~info' &&
          message.content.toLowerCase() != '~info latest' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          monsterInfo(message);
        }

        if (
          message.content.match(/~info latest/i) &&
          splitMsg[0].toLowerCase() == '~info' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          monsterInfoLatest(message);
        }

        if (
          message.content.match(/~info/i) &&
          splitMsg[0].toLowerCase() == '~info' &&
          splitMsg.length == 1 &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          currentMonsterInfo(message);
        }

        if (
          message.content.match(/~release/i) &&
          splitMsg[0].toLowerCase() == '~release' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          releaseMonster(message);
        }

        if (
          message.content.match(/~select/i) &&
          splitMsg[0].toLowerCase() == '~select' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          selectMonster(message);
        }

        if (
          message.content.match(/~favorites/i) &&
          splitMsg[0].toLowerCase() == '~favorites' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          checkFavorites(message);
        }

        if (
          message.content.match(/~favorite/i) &&
          splitMsg[0].toLowerCase() == '~favorite' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          setFavorite(message);
        }

        if (
          message.content.match(/~unfavorite/i) &&
          splitMsg[0].toLowerCase() == '~unfavorite' &&
          channel_name == cache.settings.specific_channel
        ) {
          cache.time = getCurrentTime();

          cacheClient.set(message.guild.id, {
            ...cache,
            time: getCurrentTime(),
          });

          unFavorite(message);
        }

        checkExpGain(message);
      }

      if (timestamp - cache.time < 3) {
        if (
          (message.content.match(/~release/i) &&
            channel_name == cache.settings.specific_channel) ||
          (message.content.match(/~pokemon/i) &&
            channel_name == cache.settings.specific_channel) ||
          (message.content.match(/~info/i) &&
            channel_name == cache.settings.specific_channel)
        ) {
          logger.debug(`${message.guild.name} - Cooldown present.`);
          return;
        }
      }

      const spawn_timer = getRndInteger(getRndInteger(30, 120), 2400);

      if (timestamp - cache.monster_spawn.last_spawn_time > spawn_timer) {
        spawnMonster(message, cache);
      }
    }
  }
}
