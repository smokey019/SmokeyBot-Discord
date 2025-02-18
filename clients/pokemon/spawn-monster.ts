import { EmbedBuilder, TextChannel, type CommandInteraction } from "discord.js";
import { initializing, rateLimited } from "../../bot";
import { loadCache, type ICache } from "../../clients/cache";
import {
  GuildSettingsTable,
  databaseClient,
  type IGuildSettings,
} from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { getCurrentTime, getRndInteger } from "../../utils";
import { findMonsterByID, findMonsterByIDAPI } from "./monsters";
import { getBoostedWeatherSpawns } from "./weather";

export const MONSTER_SPAWNS = loadCache("MONSTER_SPAWNS", 500);

const logger = getLogger("Pokémon-Spawn");

export async function checkSpawn(
  interaction: CommandInteraction,
  cache: ICache
): Promise<void> {
  const data = await getSpawn(interaction.guild.id);
  let spawn = undefined;

  if (!data) {
    spawn = {
      monster: null,
      spawned_at: getCurrentTime() - 30,
    };
    //MONSTER_SPAWNS.set(interaction.guild.id, spawn);
    await updateSpawn(interaction.guild.id, spawn);
  } else {
    const spawn_timer = getRndInteger(getRndInteger(60, 120), 300);
    const timestamp = getCurrentTime();
    spawn = data.spawn_data;

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
  interaction: CommandInteraction,
  cache: ICache
): Promise<void> {
  const monsterChannel = interaction.guild.channels.cache.find(
    (ch) => ch.name === cache.settings.specific_channel
  );

  if (!monsterChannel) {
    const updateGuild = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .where({ guild_id: interaction.guild.id })
      .update({ smokemon_enabled: 0 });

    if (updateGuild) {
      logger.error(
        `Disabled smokeMon for server '${interaction.guild.name}' since no channel to spawn in.`
      );
    }
  } else {
    const spawn_data = {
      monster: await findMonsterByIDAPI(
        Math.floor(Math.random() * (1025 - 1) + 1)
      ),
      spawned_at: getCurrentTime(),
    };

    let boostCount = 0;
    const boost = await getBoostedWeatherSpawns(interaction, cache);
    let isBoosted = false;
    try {
      while (
        //!spawn_data.monster?.name.english ||
        // spawn_data.monster.forme == "Mega" ||
        //!spawn_data.monster.images ||
        //!spawn_data.monster.images.normal ||
        boostCount < 10 &&
        !isBoosted
      ) {
        logger.trace(
          "Invalid monster found or trying to find a boosted type.."
        );
        spawn_data.monster = await findMonsterByIDAPI(
          Math.floor(Math.random() * (1025 - 1) + 1)
        );
        spawn_data.monster.types?.forEach((element) => {
          if (boost.boosts.includes(element.type.name)) {
            isBoosted = true;
          }
        });
        boostCount++;
      }

      //MONSTER_SPAWNS.set(interaction.guild.id, spawn_data);
      await updateSpawn(interaction.guild.id, spawn_data);

      logger.info(
        `'${interaction.guild.name}' - Monster Spawned! -> '${
          spawn_data.monster.name.charAt(0).toUpperCase() +
          spawn_data.monster.name.slice(1)
        }'`
      );

      const embed = new EmbedBuilder({
        description: "Type `/catch PokémonName` to try and catch it!",
        image: {
          url: spawn_data.monster.sprites.other["official-artwork"]
            .front_default,
        },
        title: "A wild Pokémon has appeared!",
      });

      const monsterChannel = interaction.guild?.channels.cache.find(
        (ch) => ch.name === cache.settings.specific_channel
      );

      (monsterChannel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      logger.error(error);
    }
  }
}

/**
 * Get Spawn from DB
 * @param guild
 * @returns spawn_data
 */
export async function getSpawn(
  guild: string
): Promise<{ id: number; spawn_data: any; guild: string }> {
  return await databaseClient("spawns")
    .select()
    .where({
      guild: guild,
    })
    .first();
}

/**
 * Update spawn in DB.
 * @param guild Guild ID: string
 * @param spawn_data \{ IMonsterModel, Timestamp \}
 * @returns
 */
export async function updateSpawn(
  guild: string,
  spawn_data: any
): Promise<boolean> {
  const current_spawn = await getSpawn(guild);

  if (current_spawn) {
    const update = await databaseClient("spawns")
      .update({ spawn_data: JSON.stringify(spawn_data) })
      .where({ guild: guild });

    if (update) {
      logger.trace("Updated existing spawn data with a new spawn.");
      return true;
    } else {
      logger.debug("Failed to update existing spawn data.");
      return false;
    }
  } else {
    const add = await databaseClient("spawns").insert({
      guild: guild,
      spawn_data: JSON.stringify(spawn_data),
    });

    if (add) {
      logger.trace("Successfully inserted new spawn data.");
      return true;
    } else {
      logger.debug("Failed to insert new spawn data.");
      return false;
    }
  }
}

/**
 * Force spawn a selected monster w/ ID.
 * @param message
 * @param cache
 */
export async function forceSpawn(
  interaction: CommandInteraction,
  cache: ICache
): Promise<void> {
  const monsterChannel = interaction.guild.channels.cache.find(
    (ch) => ch.name === cache.settings.specific_channel
  );
  const monster = parseFloat(interaction.options.get("pokemon").toString());

  const spawn_data = {
    monster: await findMonsterByID(monster),
    spawned_at: getCurrentTime(),
  };

  try {
    //MONSTER_SPAWNS.set(interaction.guild.id, spawn_data);
    await updateSpawn(interaction.guild.id, spawn_data);
    logger.info(
      `'${interaction.guild.name}' - Monster Spawned! -> '${spawn_data.monster.name.english}'`
    );

    const embed = new EmbedBuilder({
      description: "Type `/catch PokémonName` to try and catch it!",
      image: {
        url: spawn_data.monster.images.normal,
      },
      title: "A wild Pokémon has appeared!",
    });

    (monsterChannel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    logger.error(error);
    logger.error("\n", spawn_data.monster);
  }
}
