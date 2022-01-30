import { ColorResolvable, Interaction, MessageEmbed } from 'discord.js';
import { ICache, loadCache } from '../../clients/cache';
import {
  databaseClient,
  GuildSettingsTable,
  IGuildSettings
} from '../../clients/database';
import { initializing, rateLimited } from '../../clients/discord';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { COLOR_PURPLE } from '../../colors';
import { getCurrentTime, getRndInteger } from '../../utils';
import { findMonsterByID, getRandomMonster } from './monsters';
import { getBoostedWeatherSpawns } from './weather';

export const MONSTER_SPAWNS = loadCache('MONSTER_SPAWNS', 500);

const logger = getLogger('Pokemon-Spawn');

export async function checkSpawn(
  interaction: Interaction,
  cache: ICache,
): Promise<void> {
  let spawn = await MONSTER_SPAWNS.get(interaction.guild.id);

  if (!spawn) {
    spawn = {
      monster: undefined,
      spawned_at: getCurrentTime() - 30,
    };
    MONSTER_SPAWNS.set(interaction.guild.id, spawn);
  } else {
    const spawn_timer = getRndInteger(getRndInteger(15, 120), 300);
    const timestamp = getCurrentTime();

    if (
      timestamp - spawn.spawned_at > spawn_timer &&
      !rateLimited &&
      !initializing
    ) {
      await spawnMonster(interaction, cache);
    }
  }
}

/**
 * Spawns a random Monster.
 *
 * @param interaction
 * @param cache
 */
export async function spawnMonster(
  interaction: Interaction,
  cache: ICache,
): Promise<void> {
  const monsterChannel = interaction.guild.channels.cache.find(
    (ch) => ch.name === cache.settings.specific_channel,
  );

  if (!monsterChannel) {
    const updateGuild = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .where({ guild_id: interaction.guild.id })
      .update({ smokemon_enabled: 0 });

    if (updateGuild) {
      logger.error(
        `Disabled smokeMon for server '${interaction.guild.name}' since no channel to spawn in.`,
      );
    }
  } else {
    const spawn_data = {
      monster: await findMonsterByID(getRandomMonster()),
      spawned_at: getCurrentTime(),
    };

    let boostCount = 0;
    const boost = await getBoostedWeatherSpawns(interaction, cache);
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

      MONSTER_SPAWNS.set(interaction.guild.id, spawn_data);

      logger.info(
        `'${interaction.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`,
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
      queueMsg(embed, interaction, false, 1, monsterChannel, true);
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
  interaction: Interaction,
  monster: number,
  cache: ICache,
): Promise<void> {
  const monsterChannel = interaction.guild.channels.cache.find(
    (ch) => ch.name === cache.settings.specific_channel,
  );

  const spawn_data = {
    monster: await findMonsterByID(monster),
    spawned_at: getCurrentTime(),
  };
  try {
    if (await MONSTER_SPAWNS.set(interaction.guild.id, spawn_data)) {
      logger.info(
        `'${interaction.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`,
      );

      const embed = new MessageEmbed({
        color: COLOR_PURPLE,
        description: 'Type ~catch <Pokémon> to try and catch it!',
        image: {
          url: spawn_data.monster.images.normal,
        },
        title: 'A wild Pokémon has appeared!',
      });

      queueMsg(embed, interaction, false, 0, monsterChannel);
    }
  } catch (error) {
    logger.error(error);
    console.log(spawn_data.monster);
  }
}
