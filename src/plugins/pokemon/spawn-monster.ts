import { Message, MessageEmbed } from 'discord.js';
import { getLogger } from '../../clients/logger';
import { ICache } from '../../clients/cache';
import { getRandomMonster } from './monsters';
import { getCurrentTime } from '../../utils';
import { COLOR_PURPLE } from '../../colors';
import { getBoostedWeatherSpawns } from './weather';
import Keyv from 'keyv';
import { getConfigValue } from '../../config';

export const MONSTER_SPAWNS = new Keyv(
  `mysql://${getConfigValue('DB_USER')}:${getConfigValue(
    'DB_PASSWORD',
  )}@${getConfigValue('DB_HOST')}:3306/${getConfigValue('DB_DATABASE')}`,
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

  if (!monsterChannel || !message.guild) {
    return;
  }

  const spawn_data = {
    monster: undefined,
    spawned_at: getCurrentTime(),
  };

  let boostCount = 0;
  const boost = await getBoostedWeatherSpawns(message.guild.id);
  let isBoosted = false;
  spawn_data.monster = getRandomMonster();
  while (
    !spawn_data.monster.name.english ||
    spawn_data.monster.id < 0 ||
    spawn_data.monster.id > 893 ||
    spawn_data.monster.forme ||
    !spawn_data.monster.images ||
    (boostCount < 4 && !isBoosted)
  ) {
    logger.trace('Invalid monster found or trying to find a boosted type..');
    spawn_data.monster = getRandomMonster();
    spawn_data.monster.type.forEach((element) => {
      if (boost.boosts.includes(element)) {
        isBoosted = true;
      }
    });
    boostCount++;
  }

  if (await MONSTER_SPAWNS.set(message.guild.id, spawn_data)) {
    logger.info(
      `${message.guild.name} - Monster Spawned! | ${spawn_data.monster.name.english}`,
    );

    const embed = new MessageEmbed({
      color: spawn_data.monster.color || COLOR_PURPLE,
      description: 'Type ~catch <Pokémon> to try and catch it!',
      image: {
        url: spawn_data.monster.images.normal,
      },
      title: 'A wild Pokémon has appeared!',
    });

    await (monsterChannel as any)
      .send(embed)
      .then(() => {
        return;
      })
      .catch(console.error);
  }
}
