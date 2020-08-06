import { Message, TextChannel } from 'discord.js';
import { ICache, GLOBAL_COOLDOWN, getGCD } from '../../clients/cache';
import { catchMonster } from './catch-monster';
import {
  userDex,
  monsterDex,
  monsterInfo,
  monsterInfoLatest,
  currentMonsterInfo,
} from './info';
import { theWord, getCurrentTime } from '../../utils';
import {
  checkMonsters,
  checkFavorites,
  searchMonsters,
  checkPokedex,
} from './check-monsters';
import { releaseMonster, recoverMonster } from './release-monster';
import { selectMonster, setFavorite, unFavorite } from './monsters';
import { checkExpGain } from './exp-gain';
import { parseTrade } from './trading';
import { parseItems, msgBalance } from './items';
import { battleParser } from './battle';
import { getBoostedWeatherSpawns } from './weather';
import { MONSTER_SPAWNS } from './spawn-monster';
import { checkVote } from '../../clients/top.gg';

export const prefixes = ['!', '~', 'p!'];

export function prefix_regex(command: string): RegExp {
  return RegExp('(' + prefixes.join('|') + ')(' + command + ')', 'i');
}

export async function monsterParser(
  message: Message,
  cache: ICache,
): Promise<void> {
  const channel_name = (message.channel as TextChannel).name;
  const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');
  const command = splitMsg[0].toLowerCase();
  const prefix = command.charAt(0);
  const GCD = await getGCD(message.guild.id);
  const timestamp = getCurrentTime();
  const spawn = await MONSTER_SPAWNS.get(message.guild.id);

  checkExpGain(message);

  if (
    channel_name != cache.settings.specific_channel ||
    !prefixes.includes(prefix) ||
    !spawn
  )
    return;

  if (
    spawn.monster &&
    command.match(prefix_regex('catch|キャッチ|抓住|capture')) &&
    splitMsg.length > 1
  ) {
    catchMonster(message);
  } else if (timestamp - GCD > 3) {
    if (command.match(prefix_regex('unique'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      const tempdex = await userDex(message);
      await message.reply(
        `You have ${tempdex.length} total unique ${theWord()} in your Pokédex.`,
      );
    }

    if (
      command.match(prefix_regex('bal')) ||
      command.match(prefix_regex('balance')) ||
      command.match(prefix_regex('currency')) ||
      command.match(prefix_regex('bank'))
    ) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await msgBalance(message);
    }

    if (command.match(prefix_regex('weather'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      const boost = await getBoostedWeatherSpawns(message.guild.id);

      await message.reply(
        `the current weather is **${
          boost.weather
        }**.  You will find increased spawns of **${boost.boosts.join(
          ' / ',
        )}** on this server.`,
      );
    }

    if (command.match(prefix_regex('vote'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await message.reply(
        `vote here and get free stuff for the ${theWord()} plugin every 12 hours! https://top.gg/bot/458710213122457600/vote`,
      );
    }

    if (command.match(prefix_regex('check-vote'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await checkVote(message);
    }

    if (command.match(prefix_regex('battle'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await battleParser(message);
    }

    if (command.match(prefix_regex('pokedex'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await checkPokedex(message);
    }

    if (command.match(prefix_regex('item')) && splitMsg.length > 1) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await parseItems(message);
    }

    if (command.match(prefix_regex('trade|t')) && splitMsg.length > 1) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await parseTrade(message);
    }

    if (command.match(prefix_regex('dex|d')) && splitMsg.length > 1) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await monsterDex(message);
    }

    if (command.match(prefix_regex('search')) && splitMsg.length > 1) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await searchMonsters(message);
    }
    if (
      command.match(prefix_regex('pokemon|p')) &&
      !message.content.match(/pokedex/i)
    ) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await checkMonsters(message);
    }

    if (
      message.content.match(prefix_regex('(info|i) (\\d+)')) &&
      !message.content.match(/info latest/i)
    ) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await monsterInfo(message);
    }

    if (message.content.match(prefix_regex('info latest|i l'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await monsterInfoLatest(message);
    }

    if (
      command.match(prefix_regex('info|i')) &&
      splitMsg.length == 1 &&
      !splitMsg[0].match(/item/i) &&
      !splitMsg[0].match(/invite/i)
    ) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await currentMonsterInfo(message);
    }

    if (command.match(prefix_regex('release')) || command == '~r') {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await releaseMonster(message);
    }

    if (command.match(prefix_regex('recover'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await recoverMonster(message);
    }

    if (command.match(prefix_regex('select'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await selectMonster(message);
    }

    if (command.match(prefix_regex('favorites|favourites'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await checkFavorites(message);
    }

    if (command.match(prefix_regex('favorite|favourite'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await setFavorite(message);
    }

    if (command.match(prefix_regex('unfavorite|unfavourite'))) {
      await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

      await unFavorite(message);
    }
  }
}
