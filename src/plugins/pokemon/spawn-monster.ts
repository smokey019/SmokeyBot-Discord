import { ColorResolvable, Message, MessageEmbed } from 'discord.js';
import { ICache, loadCache } from '../../clients/cache';
import {
  databaseClient,
  GuildSettingsTable,
  IGuildSettings,
} from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { COLOR_PURPLE } from '../../colors';
import { getCurrentTime } from '../../utils';
import { findMonsterByID, getRandomMonster } from './monsters';
import { getBoostedWeatherSpawns } from './weather';

export const MONSTER_SPAWNS = loadCache('MONSTER_SPAWNS', 500);

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

  if (!monsterChannel) {
    const updateGuild = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .where({ guild_id: message.guild.id })
      .update({ smokemon_enabled: 0 });

    if (updateGuild) {
      logger.error(
        `Disabled smokeMon for server '${message.guild.name}' since no channel to spawn in.`,
      );
    }
  } else {
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
        logger.trace(
          'Invalid monster found or trying to find a boosted type..',
        );
        spawn_data.monster = await findMonsterByID(getRandomMonster());
        spawn_data.monster.type?.forEach((element: string) => {
          if (boost.boosts.includes(element)) {
            isBoosted = true;
          }
        });
        boostCount++;
      }

      MONSTER_SPAWNS.set(message.guild.id, spawn_data);

      logger.info(
        `'${message.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`,
      );

      const embed = new MessageEmbed({
        color: spawn_data.monster.color as ColorResolvable,
        description: 'Type ~catch <Pokémon> to try and catch it!',
        image: {
          url: spawn_data.monster.images.normal,
        },
        title: 'A wild Pokémon has appeared!',
      });

      // (monsterChannel as TextChannel).send({ embeds: [embed] });
      queueMsg(embed, message, false, 1, monsterChannel, true);
    } catch (error) {
      logger.error(error);
      // console.log(spawn_data.monster);
    }
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
        color: COLOR_PURPLE,
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
