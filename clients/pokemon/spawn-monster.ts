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
import { spawnChannelMessage } from "../message_queue";
import {
  findMonsterByID,
  formatPokemonTypes,
  getPokemonDisplayName,
  getPokemonSprites,
  getPokemonTypeColor,
  getRandomMonster,
  type Pokemon
} from "./monsters";
import { replaceLettersSimple } from "./utils";
import { getBoostedWeatherSpawns } from "./weather";

export const MONSTER_SPAWNS = loadCache("MONSTER_SPAWNS");

const logger = getLogger("Pokémon-Spawn");

// Constants for spawn configuration
const SPAWN_TIMER_MIN = 60;
const SPAWN_TIMER_MAX = 300;
const SPAWN_TIMER_INNER_MIN = 60;
const SPAWN_TIMER_INNER_MAX = 120;
const MAX_BOOST_ATTEMPTS = 10;
const DEFAULT_SPAWN_COOLDOWN = 30;

// Wild encounter phrases from Pokémon games
const WILD_ENCOUNTER_PHRASES = [
  "A wild {pokemon} appeared!",
  "You encountered a wild {pokemon}!",
  "A {pokemon} blocks your path!",
  "Oh! A wild {pokemon}!",
  "A wild {pokemon} jumped out!",
  "A wild {pokemon} appeared from the tall grass!",
  "A wild {pokemon} emerged from the shadows!",
  "A {pokemon} suddenly appeared!",
  "You've spotted a wild {pokemon}!",
  "A wild {pokemon} is approaching!",
  "Look! A wild {pokemon}!",
  "A wild {pokemon} popped out!",
  "A {pokemon} appeared out of nowhere!",
  "A wild {pokemon} wants to battle!",
  "You've run into a wild {pokemon}!",
  "A wild {pokemon} stands before you!",
  "A {pokemon} has appeared!",
  "Wild {pokemon} appeared!",
  "Suddenly, a wild {pokemon} appeared!",
  "A wild {pokemon} leaped out!",
] as const;

// Types for better type safety
interface SpawnData {
  monster: Pokemon | null;
  spawned_at: number;
}

interface SpawnRecord {
  id: number;
  spawn_data: SpawnData;
  guild: string;
}

interface SpawnResult {
  success: boolean;
  error?: string;
  monster?: Pokemon;
}

/**
 * Get random encounter phrase with Pokémon name
 * @param pokemonName - Name of the Pokémon
 * @returns Random encounter phrase
 */
function getRandomEncounterPhrase(pokemonName: string): string {
  const randomIndex = Math.floor(Math.random() * WILD_ENCOUNTER_PHRASES.length);
  const phrase = WILD_ENCOUNTER_PHRASES[randomIndex];

  return phrase.replace("{pokemon}", pokemonName);
}

/**
 * Generate random spawn timer
 * @returns Random timer in seconds
 */
function generateSpawnTimer(): number {
  return getRndInteger(
    getRndInteger(SPAWN_TIMER_INNER_MIN, SPAWN_TIMER_INNER_MAX),
    SPAWN_TIMER_MAX
  );
}

/**
 * Validate Pokémon data for spawning
 * @param monster - Pokémon data to validate
 * @returns boolean indicating if monster is valid
 */
function isValidMonsterForSpawn(monster: Pokemon): boolean {
  if (!monster || !monster.name || !monster.id) {
    return false;
  }

  // Use the sprite function from monsters.ts for better validation
  const sprites = getPokemonSprites(monster, false);

  // Check if we have at least one usable sprite
  return Boolean(sprites.artwork || sprites.showdown || sprites.default);
}

/**
 * Check if monster matches weather boost
 * @param monster - Pokémon data
 * @param boostedTypes - Array of boosted type names
 * @returns boolean indicating if monster is boosted
 */
function isMonsterBoosted(monster: Pokemon, boostedTypes: string[]): boolean {
  if (!monster.types || !Array.isArray(boostedTypes) || boostedTypes.length === 0) {
    return false;
  }

  return monster.types.some((typeObj) =>
    boostedTypes.includes(typeObj.type.name.toLowerCase())
  );
}

/**
 * Create spawn embed with random encounter phrase
 * @param monster - Pokémon data
 * @param isForced - Whether this is a forced spawn (different styling)
 * @returns EmbedBuilder
 */
async function createSpawnEmbed(monster: Pokemon, isForced: boolean = false): Promise<EmbedBuilder> {
  const displayName = getPokemonDisplayName(monster).split(" ")[0];

  // Get sprites using the centralized function
  const sprites = getPokemonSprites(monster, false);

  // Get types and primary type color
  const types = formatPokemonTypes(monster.types);
  const primaryType = monster.types?.[0]?.type?.name || 'normal';
  const embedColor = isForced ? 0xff6b6b : getPokemonTypeColor(primaryType);

  const phrase = getRandomEncounterPhrase(replaceLettersSimple(displayName, 0.5));

  const embed = new EmbedBuilder()
    .setTitle(phrase)
    .setDescription("Guess by using `/catch PokémonName` to try and catch it!")
    .setColor(embedColor)
    .setTimestamp();

  // Add type information if available
  if (types.length > 0) {
    embed.addFields({
      name: "Type",
      value: types.join(" • "),
      inline: true
    });
  }

  // Set images with proper fallback
  if (sprites.artwork) {
    embed.setImage(sprites.artwork);
  } else if (sprites.default) {
    embed.setImage(sprites.default);
  }

  if (sprites.showdown) {
    embed.setThumbnail(sprites.showdown);
  }

  // Add footer for forced spawns
  if (isForced) {
    embed.setFooter({ text: "Force Spawned" });
  }

  return embed;
}

/**
 * Find suitable monster for spawning with weather boost consideration
 * @param interaction - Discord command interaction
 * @param cache - Guild cache
 * @returns Promise<Pokemon | null>
 */
async function findSpawnableMonster(
  interaction: CommandInteraction,
  cache: ICache
): Promise<Pokemon | null> {
  let attempts = 0;
  let monster: Pokemon | null = null;
  let isBoosted = false;

  try {
    const boost = await getBoostedWeatherSpawns(interaction, cache);
    const boostedTypes = boost?.boosts || [];

    while (
      attempts < MAX_BOOST_ATTEMPTS &&
      (!monster || (!isBoosted && attempts < 5))
    ) {
      try {
        // Use the centralized random function
        const randomId = getRandomMonster();
        const candidate = await findMonsterByID(randomId);

        if (!candidate) {
          attempts++;
          continue;
        }

        // Use the improved validation function
        if (isValidMonsterForSpawn(candidate)) {
          const candidateIsBoosted = isMonsterBoosted(candidate, boostedTypes);

          // Accept immediately if boosted, or if we've tried enough times
          if (candidateIsBoosted || attempts >= 5) {
            monster = candidate;
            isBoosted = candidateIsBoosted;
            break;
          }

          // Keep this as backup if no boosted monster found
          if (!monster) {
            monster = candidate;
          }
        }

        attempts++;
      } catch (error) {
        logger.warn(
          `Error fetching monster on attempt ${attempts + 1}:`,
          error
        );
        attempts++;
      }
    }

    if (monster) {
      const displayName = getPokemonDisplayName(monster);
      if (isBoosted) {
        logger.debug(
          `Found weather-boosted ${displayName} after ${attempts} attempts`
        );
      } else {
        logger.debug(`Found regular ${displayName} after ${attempts} attempts`);
      }
    }

    return monster;
  } catch (error) {
    logger.error("Error in findSpawnableMonster:", error);
    return null;
  }
}

/**
 * Check if a spawn should occur and trigger it if conditions are met
 * @param interaction - Discord command interaction
 * @param cache - Guild cache
 */
export async function checkSpawn(
  interaction: CommandInteraction,
  cache: ICache
): Promise<void> {
  try {
    if (rateLimited || initializing) {
      return;
    }

    const guildId = interaction.guild?.id;
    if (!guildId) {
      logger.warn("No guild ID available for spawn check");
      return;
    }

    let spawnRecord = await getSpawn(guildId);

    if (!spawnRecord) {
      // Initialize spawn data for new guild
      const initialSpawn: SpawnData = {
        monster: null,
        spawned_at: getCurrentTime() - DEFAULT_SPAWN_COOLDOWN,
      };

      const success = await updateSpawn(guildId, initialSpawn);
      if (!success) {
        logger.error(`Failed to initialize spawn data for guild ${guildId}`);
        return;
      }

      spawnRecord = { id: 0, spawn_data: initialSpawn, guild: guildId };
    }

    const spawnTimer = generateSpawnTimer();
    const currentTime = getCurrentTime();
    const timeSinceSpawn = currentTime - spawnRecord.spawn_data.spawned_at;

    if (timeSinceSpawn > spawnTimer) {
      await spawnMonster(interaction, cache);
    }
  } catch (error) {
    logger.error("Error in checkSpawn:", error);
  }
}

/**
 * Spawn a random monster in the designated channel
 * @param interaction - Discord command interaction
 * @param cache - Guild cache
 */
export async function spawnMonster(
  interaction: CommandInteraction,
  cache: ICache
): Promise<SpawnResult> {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return { success: false, error: "No guild ID available" };
    }

    // Find the spawn channel
    const channelName = cache.settings?.specific_channel;
    if (!channelName) {
      logger.error(
        `No spawn channel configured for guild ${interaction.guild?.name}`
      );
      return { success: false, error: "No spawn channel configured" };
    }

    const spawnChannel = interaction.guild?.channels.cache.find(
      (ch) => ch.name === channelName
    ) as TextChannel;

    if (!spawnChannel) {
      // Disable spawns if channel doesn't exist
      try {
        await databaseClient<IGuildSettings>(GuildSettingsTable)
          .where({ guild_id: guildId })
          .update({ smokemon_enabled: 0 });

        logger.error(
          `Disabled smokeMon for server '${interaction.guild?.name}' - spawn channel '${channelName}' not found`
        );
      } catch (dbError) {
        logger.error("Error disabling smokeMon:", dbError);
      }

      return { success: false, error: "Spawn channel not found" };
    }

    // Find a suitable monster to spawn
    const monster = await findSpawnableMonster(interaction, cache);
    if (!monster) {
      logger.error("Could not find a suitable monster to spawn");
      return { success: false, error: "No suitable monster found" };
    }

    // Create spawn data
    const spawnData: SpawnData = {
      monster,
      spawned_at: getCurrentTime(),
    };

    // Update spawn in database
    const updateSuccess = await updateSpawn(guildId, spawnData);
    if (!updateSuccess) {
      logger.error("Failed to update spawn data in database");
      return { success: false, error: "Database update failed" };
    }

    // Create and send spawn embed
    const embed = await createSpawnEmbed(monster, false);

    try {
      await spawnChannelMessage(embed, interaction, 3); // High priority for spawns

      const displayName = getPokemonDisplayName(monster);
      logger.info(
        `'${interaction.guild?.name}' - Monster Spawned! -> '${displayName}'`
      );

      return { success: true, monster };
    } catch (messageError) {
      logger.error("Error sending spawn message:", messageError);

      // Fallback: try direct channel send
      try {
        await spawnChannel.send({ embeds: [embed] });
        const displayName = getPokemonDisplayName(monster);
        logger.info(`Spawn message sent via fallback for ${displayName}`);
        return { success: true, monster };
      } catch (fallbackError) {
        logger.error("Fallback spawn message also failed:", fallbackError);
        return { success: false, error: "Message sending failed" };
      }
    }
  } catch (error) {
    logger.error("Error in spawnMonster:", error);
    return { success: false, error: `Unexpected error: ${error.message}` };
  }
}

/**
 * Get spawn data from database
 * @param guildId - Guild ID
 * @returns Promise<SpawnRecord | null>
 */
export async function getSpawn(guildId: string): Promise<SpawnRecord | null> {
  try {
    if (!guildId) {
      throw new Error("Guild ID is required");
    }

    const result = await databaseClient("spawns")
      .select()
      .where({ guild: guildId })
      .first();

    if (result && typeof result.spawn_data === "string") {
      try {
        result.spawn_data = JSON.parse(result.spawn_data);
      } catch (parseError) {
        logger.error(
          `Error parsing spawn_data for guild ${guildId}:`,
          parseError
        );
        return null;
      }
    }

    return result || null;
  } catch (error) {
    logger.error(`Error getting spawn data for guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Update spawn data in database
 * @param guildId - Guild ID
 * @param spawnData - Spawn data to store
 * @returns Promise<boolean>
 */
export async function updateSpawn(
  guildId: string,
  spawnData: SpawnData
): Promise<boolean> {
  try {
    if (!guildId) {
      throw new Error("Guild ID is required");
    }

    const serializedData = JSON.stringify(spawnData);
    const existingSpawn = await getSpawn(guildId);

    if (existingSpawn) {
      // Update existing record
      const updateResult = await databaseClient("spawns")
        .update({ spawn_data: serializedData })
        .where({ guild: guildId });

      if (updateResult > 0) {
        logger.trace(`Updated spawn data for guild ${guildId}`);
        return true;
      } else {
        logger.warn(`No rows updated for spawn data in guild ${guildId}`);
        return false;
      }
    } else {
      // Insert new record
      const insertResult = await databaseClient("spawns").insert({
        guild: guildId,
        spawn_data: serializedData,
      });

      if (insertResult) {
        logger.trace(`Inserted new spawn data for guild ${guildId}`);
        return true;
      } else {
        logger.warn(`Failed to insert spawn data for guild ${guildId}`);
        return false;
      }
    }
  } catch (error) {
    logger.error(`Error updating spawn data for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Force spawn a specific monster by ID
 * @param interaction - Discord command interaction
 * @param cache - Guild cache
 */
export async function forceSpawn(
  interaction: CommandInteraction,
  cache: ICache
): Promise<SpawnResult> {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return { success: false, error: "No guild ID available" };
    }

    // Get the monster ID from command options
    const pokemonOption = interaction.options.get("pokemon");
    if (!pokemonOption) {
      return { success: false, error: "No Pokémon ID provided" };
    }

    const monsterId = parseInt(pokemonOption.value?.toString() || "");

    // Validate the ID using the function from monsters.ts (assuming it exists)
    if (isNaN(monsterId) || monsterId < 1 || monsterId > 1025) {
      return { success: false, error: "Invalid Pokémon ID (must be 1-1025)" };
    }

    // Find the spawn channel
    const channelName = cache.settings?.specific_channel;
    if (!channelName) {
      return { success: false, error: "No spawn channel configured" };
    }

    const spawnChannel = interaction.guild?.channels.cache.find(
      (ch) => ch.name === channelName
    ) as TextChannel;

    if (!spawnChannel) {
      return { success: false, error: "Spawn channel not found" };
    }

    // Get the specific monster using the centralized function
    const monster = await findMonsterByID(monsterId);
    if (!monster) {
      return { success: false, error: "Pokémon not found" };
    }

    // Validate the monster for spawning
    if (!isValidMonsterForSpawn(monster)) {
      return { success: false, error: "Pokémon is not suitable for spawning (missing sprites)" };
    }

    // Create spawn data
    const spawnData: SpawnData = {
      monster,
      spawned_at: getCurrentTime(),
    };

    // Update spawn in database
    const updateSuccess = await updateSpawn(guildId, spawnData);
    if (!updateSuccess) {
      logger.error("Failed to update forced spawn data in database");
      return { success: false, error: "Database update failed" };
    }

    // Create spawn embed with forced styling
    const embed = await createSpawnEmbed(monster, true);

    try {
      await spawnChannelMessage(embed, interaction, 3);

      const displayName = getPokemonDisplayName(monster);
      logger.info(
        `'${interaction.guild?.name}' - Forced Monster Spawn! -> '${displayName}'`
      );

      return { success: true, monster };
    } catch (messageError) {
      logger.error("Error sending forced spawn message:", messageError);

      // Fallback: try direct channel send
      try {
        await spawnChannel.send({ embeds: [embed] });
        const displayName = getPokemonDisplayName(monster);
        logger.info(
          `Forced spawn message sent via fallback for ${displayName}`
        );
        return { success: true, monster };
      } catch (fallbackError) {
        logger.error(
          "Fallback forced spawn message also failed:",
          fallbackError
        );
        return { success: false, error: "Message sending failed" };
      }
    }
  } catch (error) {
    logger.error("Error in forceSpawn:", error);
    return { success: false, error: `Unexpected error: ${error.message}` };
  }
}

/**
 * Get spawn statistics for monitoring
 * @param guildId - Guild ID
 * @returns Object with spawn statistics
 */
export async function getSpawnStats(guildId: string) {
  try {
    const spawnData = await getSpawn(guildId);
    if (!spawnData) {
      return { hasSpawnData: false };
    }

    const currentTime = getCurrentTime();
    const timeSinceSpawn = currentTime - spawnData.spawn_data.spawned_at;
    const nextSpawnWindow = generateSpawnTimer();

    // Get display name for the last monster
    let lastMonsterName = "Unknown";
    if (spawnData.spawn_data.monster) {
      lastMonsterName = getPokemonDisplayName(spawnData.spawn_data.monster);
    }

    return {
      hasSpawnData: true,
      lastSpawnTime: spawnData.spawn_data.spawned_at,
      timeSinceSpawn,
      nextSpawnWindow,
      canSpawn: timeSinceSpawn > nextSpawnWindow,
      lastMonster: lastMonsterName,
    };
  } catch (error) {
    logger.error(`Error getting spawn stats for guild ${guildId}:`, error);
    return { hasSpawnData: false, error: error.message };
  }
}

// Export utility functions for testing
export {
  WILD_ENCOUNTER_PHRASES,
  createSpawnEmbed,
  findSpawnableMonster,
  generateSpawnTimer,
  getRandomEncounterPhrase,
  isMonsterBoosted,
  isValidMonsterForSpawn
};

