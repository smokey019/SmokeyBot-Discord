import { Message, MessageEmbed } from 'discord.js';
import Keyv from 'keyv';
import { ICache } from '../../clients/cache';
import { initializing, rateLimited } from '../../clients/discord';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { COLOR_PURPLE } from '../../colors';
import { getConfigValue } from '../../config';
import { getCurrentTime } from '../../utils';
import { findMonsterByID, getRandomMonster } from './monsters';
import { getBoostedWeatherSpawns } from './weather';

export const MONSTER_SPAWNS = new Keyv(
  `mysql://${getConfigValue('DB_USER')}:${getConfigValue(
    'DB_PASSWORD',
  )}@${getConfigValue('DB_HOST')}:${getConfigValue('DB_PORT')}/${getConfigValue(
    'DB_DATABASE',
  )}`,
  { keySize: 191, namespace: 'MONSTER_SPAWNS' },
);

const logger = getLogger('Pokemon-Spawn');

/**
 * Spawns a random Monster.
 *
 * @param message
 * @param cache
 */
export async function spawnMonster(
  message: Message,
  cache: ICache,
): Promise<void> {
  const monsterChannel = message.guild?.channels.cache.find(
    (ch) => ch.name === cache.settings.specific_channel,
  );

  if (!monsterChannel || !message.guild || rateLimited || initializing) {
    return;
  }

  const spawn_data = {
    monster: await findMonsterByID(getRandomMonster()),
    spawned_at: getCurrentTime(),
  };

  let boostCount = 0;
  const boost = await getBoostedWeatherSpawns(message, cache);
  let isBoosted = false;
  try {
    while (
      !spawn_data.monster?.name.english ||
      // spawn_data.monster.forme == "Mega" ||
      !spawn_data.monster.images ||
      !spawn_data.monster.images.normal ||
      (boostCount < 10 && !isBoosted)
    ) {
      logger.trace('Invalid monster found or trying to find a boosted type..');
      spawn_data.monster = await findMonsterByID(getRandomMonster());
      spawn_data.monster.type?.forEach((element: string) => {
        if (boost.boosts.includes(element)) {
          isBoosted = true;
        }
      });
      boostCount++;
    }

    if (await MONSTER_SPAWNS.set(message.guild.id, spawn_data)) {
      logger.info(
        `'${message.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`,
      );

      const embed = new MessageEmbed({
        color: spawn_data.monster.color || COLOR_PURPLE,
        description: 'Type ~catch <Pokémon> to try and catch it!',
        image: {
          url: spawn_data.monster.images.normal,
        },
        title: 'A wild Pokémon has appeared!',
      });

      queueMsg(embed, message, false, 1, monsterChannel);
    }
  } catch (error) {
    logger.error(error);
    console.log(spawn_data.monster);
  }
}

/**
 * Force spawn a selected monster w/ ID.
 * @param message
 * @param cache
 */
export async function forceSpawn(
  message: Message,
  cache: ICache,
): Promise<void> {
  const monsterChannel = message.guild?.channels.cache.find(
    (ch) => ch.name === cache.settings.specific_channel,
  );

  if (!monsterChannel || !message.guild || rateLimited || initializing) {
    return;
  }

  const args = message.content
    .slice(1)
    .trim()
    .toLowerCase()
    .replace(/ {2,}/gm, ' ')
    .split(/ +/gm);

  const spawn_data = {
    monster: await findMonsterByID(parseFloat(args[1])),
    spawned_at: getCurrentTime(),
  };
  try {
    if (await MONSTER_SPAWNS.set(message.guild.id, spawn_data)) {
      logger.info(
        `'${message.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`,
      );

      const embed = new MessageEmbed({
        color: spawn_data.monster.color || COLOR_PURPLE,
        description: 'Type ~catch <Pokémon> to try and catch it!',
        image: {
          url: spawn_data.monster.images.normal,
        },
        title: 'A wild Pokémon has appeared!',
      });

      queueMsg(embed, message, false, 0, monsterChannel);
    }
  } catch (error) {
    logger.error(error);
    console.log(spawn_data.monster);
  }
}
