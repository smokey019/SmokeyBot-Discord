import { Message, TextChannel } from 'discord.js';
import { getGCD, GLOBAL_COOLDOWN, ICache } from '../../clients/cache';
import { databaseClient, IGuildSettings } from '../../clients/database';
import { checkVote } from '../../clients/top.gg';
import { getCurrentTime } from '../../utils';
import { battleParser } from './battle';
import { catchMonster } from './catch-monster';
import {
  checkFavorites,
  checkMonsters,
  checkPokedex,
  searchMonsters,
} from './check-monsters';
import { checkExpGain } from './exp-gain';
import {
  checkUniqueMonsters,
  currentMonsterInfo,
  currentMonsterInfoBETA,
  monsterDex,
  monsterInfo,
  monsterInfoLatest,
} from './info';
import { msgBalance, parseItems } from './items';
import { checkLeaderboard } from './leaderboard';
import { selectMonster, setFavorite, unFavorite } from './monsters';
import { setNickname } from './nickname';
import { recoverMonster, releaseMonster } from './release-monster';
import { forceSpawn, MONSTER_SPAWNS, spawnMonster } from './spawn-monster';
import { parseTrade } from './trading';
import {
  checkServerWeather,
  getBotStats,
  parseArgs,
  voteCommand,
} from './utils';

export const default_prefixes = ['!', '~', 'p!'];

export async function monsterParser(
  message: Message,
  cache: ICache,
): Promise<void> {
  await checkExpGain(message);

  const channel_name = (message.channel as TextChannel).name;
  const GCD = await getGCD(message.guild.id);
  const timestamp = getCurrentTime();
  const spawn = await MONSTER_SPAWNS.get(message.guild.id);
  const load_prefixes = await getPrefixes(message.guild.id);
  const prefixes = RegExp(load_prefixes.join('|'));
  const detect_prefix = message.content.match(prefixes);

  if (channel_name != cache.settings.specific_channel || !detect_prefix) return;
  const prefix = detect_prefix.shift();
  const args = message.content
    .slice(prefix.length)
    .trim()
    .toLowerCase()
    .replace(/ {2,}/gm, ' ')
    .split(/ +/);
  const command = args.shift();

  if (
    spawn.monster &&
    args &&
    (command == 'catch' ||
      command == 'キャッチ' ||
      command == '抓住' ||
      command == 'capture')
  ) {
    await catchMonster(message, cache);
  } else if (timestamp - GCD > 3) {
    switch (command) {
      case 'unique':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
        await checkUniqueMonsters(message);

        break;

      case 'leaderboard':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
        await checkLeaderboard(message);

        break;

      case 'stats':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
        await getBotStats(message);

        break;

      case 'bal':
      case 'balance':
      case 'currency':
      case 'bank':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await msgBalance(message);

        break;

      case 'weather':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
        await checkServerWeather(message, cache);

        break;

      case 'nickname':
      case 'nick':
        if (args[0] == 'set') {
          GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
          await setNickname(message);
        }

        break;

      case 'vote':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());
        await voteCommand(message);

        break;

      case 'check-vote':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await checkVote(message);

        break;

      case 'pokedex':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await checkPokedex(message);

        break;

      case 'item':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await parseItems(message);

        break;

      case 'trade':
      case 't':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await parseTrade(message);

        break;

      case 'dex':
      case 'd':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await monsterDex(message);

        break;

      case 'search':
      case 's':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await searchMonsters(message);

        break;

      case 'pokemon':
      case 'p':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await checkMonsters(message);

        break;

      case 'spawn':
        if (message.author.id == '90514165138989056') {
          await spawnMonster(message, cache);
        }

        break;

      case 'fspawn':
        if (message.author.id == '90514165138989056') {
          await forceSpawn(message, cache);
        }

        break;

      case 'info':
      case 'i':
        if (args[0]?.match(/\d+/)) {
          GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

          await monsterInfo(message);
        } else if (args.length == 0) {
          GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

          await currentMonsterInfo(message);
        } else if (args[0] == 'latest' || args[0] == 'l') {
          GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

          await monsterInfoLatest(message);
        }

        break;

      case 'ib':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await currentMonsterInfoBETA(message);

        break;

      case 'release':
      case 'r':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await releaseMonster(message);

        break;

      case 'recover':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await recoverMonster(message);

        break;

      case 'select':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await selectMonster(message);

        break;

      case 'favorites':
      case 'favourites':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await checkFavorites(message);

        break;

      case 'favorite':
      case 'favourite':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await setFavorite(message);

        break;

      case 'unfavorite':
      case 'unfavourite':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await unFavorite(message);

        break;

      case 'battle':
        GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

        await battleParser(message);

        break;
    }
  }
}

/**
 * Retrieve Guild Prefixes
 * Default: ['!', '~', 'p!']
 * @param guild_id message.guild.id
 * @returns ['!', '~', 'p!'] or more.
 */
export async function getPrefixes(guild_id: string): Promise<any> {
  const data = await databaseClient('guild_settings')
    .where({
      guild_id: guild_id,
    })
    .select('prefixes')
    .first();

  return JSON.parse(data.prefixes);
}

/**
 * Update a Guild's Prefixes
 * @param guild_id
 * @param prefixes
 * @returns
 */
export async function updatePrefixes(
  guild_id: string,
  prefixes: string[],
): Promise<any> {
  return await databaseClient<IGuildSettings>('guild_settings')
    .where({
      guild_id: guild_id,
    })
    .update({
      prefixes: JSON.stringify(prefixes),
    });
}

export async function set_prefix(message: Message): Promise<void> {
  let i = 0;
  const parse = await parseArgs(message);
  const prefixes = await getPrefixes(message.guild.id);

  if (!parse.args[1] || (!parse.args[2] && parse.args[1] != 'default')) {
    await message.reply(
      'Not enough parameters. Example: `!prefix enable !`. Type `!prefix help` for more information.',
    );
    return;
  }

  if (parse.args[1] == 'enable') {
    switch (parse.args[2]) {
      case '!':
        if (!prefixes.includes('!')) {
          prefixes.push('!');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `!` as a prefix. Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;
      case '?':
        if (!prefixes.includes('\\?')) {
          prefixes.push('\\?');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `?` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;
      case '~':
        if (!prefixes.includes('~')) {
          prefixes.push('~');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `~` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;
      case 'p!':
        if (!prefixes.includes('p!')) {
          prefixes.push('p!');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `p!` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;

      default:
        await message.reply(
          'You can enable/disable these prefixes: ' + prefixes,
        );
        break;
    }
  } else if (parse.args[1] == 'disable') {
    switch (parse.args[2]) {
      case '!':
        if (prefixes.includes('!') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === '!') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `!` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;
      case '?':
        if (prefixes.includes('\\?') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === '\\?') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `?` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;
      case '~':
        if (prefixes.includes('~') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === '~') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `~` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;
      case 'p!':
        if (prefixes.includes('p!') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === 'p!') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `p!` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;

      default:
        await message.reply(
          'You can enable/disable these prefixes: ' + prefixes,
        );
        break;
    }
  } else if (parse.args[1] == 'default') {
    await updatePrefixes(message.guild.id, default_prefixes);
    await message.reply(
      'Successfully reset prefixes back to default: ' +
        default_prefixes.join(', '),
    );
  } else if (parse.args[1] == 'help') {
    await message.reply(
      'Enable/disable prefixes: `!prefix disable ~` or `!prefix enable p!`. By default SmokeyBot uses: `' +
        default_prefixes.join(' ') +
        '`.',
    );
  }
}

export async function prefix_check(message: Message): Promise<boolean> {
  const prefixes = await getPrefixes(message.guild.id);

  if (prefixes.includes(message.content.charAt(0))) {
    return true;
  } else {
    return false;
  }
}
