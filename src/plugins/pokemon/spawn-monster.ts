import { Message, MessageEmbed } from 'discord.js';

import { getLogger } from '../../clients/logger';
import { cacheClient, ICache } from '../../clients/cache';
import { getRandomMonster, IMonsterDex } from './monsters';
import { getCurrentTime } from '../../utils';
import { COLOR_PURPLE } from '../../colors';

const logger = getLogger('Pokemon');

/**
 * Spawns a random Monster.
 *
 * @notes
 * Consider simplifying the parameters. This function should not have to
 * know about `Message` or the entire `cache`. Monster channel missing or
 * don't have a guild ID? Never call this.
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

  const timestamp = getCurrentTime();

  cache.monster_spawn.last_spawn_time = timestamp;

  cacheClient.set(message.guild.id, {
    ...cache,
    monster_spawn: {
      ...cache.monster_spawn,
      last_spawn_time: timestamp,
    },
  });

  let monster: IMonsterDex = getRandomMonster();
  while (
    !monster.name.english ||
    monster.id < 0 ||
    monster.id > 890 ||
    monster.forme ||
    !monster.images
  ) {
    logger.debug('Invalid monster found.');
    console.log(monster);
    monster = getRandomMonster();
  }

  // const tmpID = `${monster.id}`.padStart(3, '0');
  // const img = `https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`;

  const embed = new MessageEmbed({
    color: monster.color || COLOR_PURPLE,
    description: 'Type ~catch <Pokémon> to try and catch it!',
    image: {
      url: monster.images.normal,
    },
    title: 'A wild Pokémon has appeared!',
  });

  // TODO: This is using a private API or trying to call a function
  // that does not exist. Consider refactoring.
  //
  // ? it's a usage of line #25
  await (monsterChannel as any)
    .send(embed)
    .then(() => {
      cache.monster_spawn.current_spawn = monster;
      cache.monster_spawn.msg = message;

      if (message.guild) {
        cacheClient.set(message.guild.id, cache);

        logger.info(
          `${message.guild.name} - Monster Spawned! | ${monster.name.english}`,
        );
      }

      return;
    })
    .catch(console.error);
}
