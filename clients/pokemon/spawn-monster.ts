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
import { findMonsterByIDAPI } from "./monsters";
import { getBoostedWeatherSpawns } from "./weather";

export const MONSTER_SPAWNS = loadCache("MONSTER_SPAWNS");

const logger = getLogger("Pokémon-Spawn");

// Constants for spawn configuration
const SPAWN_TIMER_MIN = 60;
const SPAWN_TIMER_MAX = 300;
const SPAWN_TIMER_INNER_MIN = 60;
const SPAWN_TIMER_INNER_MAX = 120;
const MAX_BOOST_ATTEMPTS = 10;
const POKEMON_ID_MIN = 1;
const POKEMON_ID_MAX = 1025;
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
  "A wild {pokemon} leaped out!"
] as const;

// Types for better type safety
interface SpawnData {
  monster: any;
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
  monster?: any;
}

export interface Pokemon {
  abilities: Array<{
    ability: {
      name: string;
      url: string;
    };
    is_hidden: boolean;
    slot: number;
  }>;
  base_experience: number;
  cries: {
    latest: string;
    legacy: string;
  };
  forms: Array<{
    name: string;
    url: string;
  }>;
  game_indices: Array<{
    game_index: number;
    version: {
      name: string;
      url: string;
    };
  }>;
  height: number;
  held_items: Array<{
    item: {
      name: string;
      url: string;
    };
    version_details: Array<{
      rarity: number;
      version: {
        name: string;
        url: string;
      };
    }>;
  }>;
  id: number;
  is_default: boolean;
  location_area_encounters: string;
  moves: Array<{
    move: {
      name: string;
      url: string;
    };
    version_group_details: Array<{
      level_learned_at: number;
      move_learn_method: {
        name: string;
        url: string;
      };
      order: number | null;
      version_group: {
        name: string;
        url: string;
      };
    }>;
  }>;
  name: string;
  order: number;
  past_abilities: Array<{
    abilities: Array<{
      ability: {
        name: string;
        url: string;
      } | null;
      is_hidden: boolean;
      slot: number;
    }>;
    generation: {
      name: string;
      url: string;
    };
  }>;
  past_types: any[];
  species: {
    name: string;
    url: string;
  };
  sprites: {
    back_default: string | null;
    back_female: string | null;
    back_shiny: string | null;
    back_shiny_female: string | null;
    front_default: string | null;
    front_female: string | null;
    front_shiny: string | null;
    front_shiny_female: string | null;
    other: {
      dream_world: {
        front_default: string | null;
        front_female: string | null;
      };
      home: {
        front_default: string | null;
        front_female: string | null;
        front_shiny: string | null;
        front_shiny_female: string | null;
      };
      "official-artwork": {
        front_default: string | null;
        front_shiny: string | null;
      };
      showdown: {
        back_default: string | null;
        back_female: string | null;
        back_shiny: string | null;
        back_shiny_female: string | null;
        front_default: string | null;
        front_female: string | null;
        front_shiny: string | null;
        front_shiny_female: string | null;
      };
    };
    versions: {
      "generation-i": {
        "red-blue": {
          back_default: string | null;
          back_gray: string | null;
          back_transparent: string | null;
          front_default: string | null;
          front_gray: string | null;
          front_transparent: string | null;
        };
        yellow: {
          back_default: string | null;
          back_gray: string | null;
          back_transparent: string | null;
          front_default: string | null;
          front_gray: string | null;
          front_transparent: string | null;
        };
      };
      "generation-ii": {
        crystal: {
          back_default: string | null;
          back_shiny: string | null;
          back_shiny_transparent: string | null;
          back_transparent: string | null;
          front_default: string | null;
          front_shiny: string | null;
          front_shiny_transparent: string | null;
          front_transparent: string | null;
        };
        gold: {
          back_default: string | null;
          back_shiny: string | null;
          front_default: string | null;
          front_shiny: string | null;
          front_transparent: string | null;
        };
        silver: {
          back_default: string | null;
          back_shiny: string | null;
          front_default: string | null;
          front_shiny: string | null;
          front_transparent: string | null;
        };
      };
      "generation-iii": {
        emerald: {
          front_default: string | null;
          front_shiny: string | null;
        };
        "firered-leafgreen": {
          back_default: string | null;
          back_shiny: string | null;
          front_default: string | null;
          front_shiny: string | null;
        };
        "ruby-sapphire": {
          back_default: string | null;
          back_shiny: string | null;
          front_default: string | null;
          front_shiny: string | null;
        };
      };
      "generation-iv": {
        "diamond-pearl": {
          back_default: string | null;
          back_female: string | null;
          back_shiny: string | null;
          back_shiny_female: string | null;
          front_default: string | null;
          front_female: string | null;
          front_shiny: string | null;
          front_shiny_female: string | null;
        };
        "heartgold-soulsilver": {
          back_default: string | null;
          back_female: string | null;
          back_shiny: string | null;
          back_shiny_female: string | null;
          front_default: string | null;
          front_female: string | null;
          front_shiny: string | null;
          front_shiny_female: string | null;
        };
        platinum: {
          back_default: string | null;
          back_female: string | null;
          back_shiny: string | null;
          back_shiny_female: string | null;
          front_default: string | null;
          front_female: string | null;
          front_shiny: string | null;
          front_shiny_female: string | null;
        };
      };
      "generation-v": {
        "black-white": {
          animated: {
            back_default: string | null;
            back_female: string | null;
            back_shiny: string | null;
            back_shiny_female: string | null;
            front_default: string | null;
            front_female: string | null;
            front_shiny: string | null;
            front_shiny_female: string | null;
          };
          back_default: string | null;
          back_female: string | null;
          back_shiny: string | null;
          back_shiny_female: string | null;
          front_default: string | null;
          front_female: string | null;
          front_shiny: string | null;
          front_shiny_female: string | null;
        };
      };
      "generation-vi": {
        "omegaruby-alphasapphire": {
          front_default: string | null;
          front_female: string | null;
          front_shiny: string | null;
          front_shiny_female: string | null;
        };
        "x-y": {
          front_default: string | null;
          front_female: string | null;
          front_shiny: string | null;
          front_shiny_female: string | null;
        };
      };
      "generation-vii": {
        icons: {
          front_default: string | null;
          front_female: string | null;
        };
        "ultra-sun-ultra-moon": {
          front_default: string | null;
          front_female: string | null;
          front_shiny: string | null;
          front_shiny_female: string | null;
        };
      };
      "generation-viii": {
        icons: {
          front_default: string | null;
          front_female: string | null;
        };
      };
    };
  };
  stats: Array<{
    base_stat: number;
    effort: number;
    stat: {
      name: string;
      url: string;
    };
  }>;
  types: Array<{
    slot: number;
    type: {
      name: string;
      url: string;
    };
  }>;
  weight: number;
}

/**
 * Get random encounter phrase with Pokémon name
 * @param pokemonName - Name of the Pokémon
 * @returns Random encounter phrase
 */
function getRandomEncounterPhrase(pokemonName: string): string {
  const randomIndex = Math.floor(Math.random() * WILD_ENCOUNTER_PHRASES.length);
  const phrase = WILD_ENCOUNTER_PHRASES[randomIndex];
  return phrase.replace('{pokemon}', pokemonName);
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
 * Generate random Pokémon ID
 * @returns Random Pokémon ID
 */
function getRandomPokemonId(): number {
  return Math.floor(Math.random() * (POKEMON_ID_MAX - POKEMON_ID_MIN) + POKEMON_ID_MIN);
}

/**
 * Validate Pokémon data for spawning
 * @param monster - Pokémon data to validate
 * @returns boolean indicating if monster is valid
 */
function isValidMonster(monster: Pokemon): boolean {
  if (!monster) return false;
  if (!monster.name.includes('-')) return false;

  // Check for required image data
  const hasOfficialArt = monster.sprites?.other?.["official-artwork"]?.front_default;
  const hasShowdownSprite = monster.sprites?.other?.showdown?.front_default;
  const hasNormalImage = monster.sprites?.other?.home?.front_default;

  return Boolean(hasOfficialArt || hasNormalImage);
}

/**
 * Check if monster matches weather boost
 * @param monster - Pokémon data
 * @param boostedTypes - Array of boosted type names
 * @returns boolean indicating if monster is boosted
 */
function isMonsterBoosted(monster: Pokemon, boostedTypes: string[]): boolean {
  if (!monster.types || !Array.isArray(boostedTypes)) return false;

  return monster.types.some(typeObj =>
    boostedTypes.includes(typeObj.type.name)
  );
}

/**
 * Create spawn embed with random encounter phrase
 * @param monster - Pokémon data
 * @returns EmbedBuilder
 */
function createSpawnEmbed(monster: Pokemon): EmbedBuilder {
  const pokemonName = monster.name;
  const encounterPhrase = getRandomEncounterPhrase(pokemonName);

  const imageUrl = monster.sprites?.other?.["official-artwork"]?.front_default

  const thumbnailUrl = monster.sprites?.other?.showdown?.front_default;

  const embed = new EmbedBuilder()
    .setTitle(encounterPhrase)
    .setDescription("Guess by using `/catch PokémonName` to try and catch it!")
    .setColor(0x3498db)
    .setTimestamp();

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
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

    while (attempts < MAX_BOOST_ATTEMPTS && (!monster || (!isBoosted && attempts < 5))) {
      try {
        const randomId = getRandomPokemonId();
        const candidate = await findMonsterByIDAPI(randomId);

        if (!candidate) {
          attempts++;
          continue;
        }

        // Always accept valid monsters, but prefer boosted ones in first few attempts
        if (isValidMonster(candidate)) {
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
        logger.warn(`Error fetching monster on attempt ${attempts + 1}:`, error);
        attempts++;
      }
    }

    if (monster && isBoosted) {
      logger.debug(`Found weather-boosted ${monster.name} after ${attempts} attempts`);
    } else if (monster) {
      logger.debug(`Found regular ${monster.name} after ${attempts} attempts`);
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
      logger.error(`No spawn channel configured for guild ${interaction.guild?.name}`);
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
    const embed = createSpawnEmbed(monster);

    try {
      await spawnChannelMessage(embed, interaction, 3); // High priority for spawns

      logger.info(
        `'${interaction.guild?.name}' - Monster Spawned! -> '${
          monster.name.charAt(0).toUpperCase() + monster.name.slice(1)
        }'`
      );

      return { success: true, monster };
    } catch (messageError) {
      logger.error("Error sending spawn message:", messageError);

      // Fallback: try direct channel send
      try {
        await spawnChannel.send({ embeds: [embed] });
        logger.info(`Spawn message sent via fallback for ${monster.name}`);
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

    if (result && typeof result.spawn_data === 'string') {
      try {
        result.spawn_data = JSON.parse(result.spawn_data);
      } catch (parseError) {
        logger.error(`Error parsing spawn_data for guild ${guildId}:`, parseError);
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
export async function updateSpawn(guildId: string, spawnData: SpawnData): Promise<boolean> {
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

    const monsterId = parseFloat(pokemonOption.toString());
    if (isNaN(monsterId) || monsterId < POKEMON_ID_MIN || monsterId > POKEMON_ID_MAX) {
      return { success: false, error: "Invalid Pokémon ID" };
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

    // Get the specific monster
    const monster = await findMonsterByIDAPI(monsterId);
    if (!monster) {
      return { success: false, error: "Monster not found" };
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

    // Create spawn embed - for forced spawns, use the internal image structure
    const embed = new EmbedBuilder()
      .setTitle(getRandomEncounterPhrase(monster.name))
      .setDescription("Type `/catch PokémonName` to try and catch it!")
      .setColor(0xff6b6b) // Different color to indicate forced spawn
      .setTimestamp();

    if (monster.images?.normal) {
      embed.setImage(monster.images.normal);
    }

    try {
      await spawnChannelMessage(embed, interaction, 3);

      logger.info(
        `'${interaction.guild?.name}' - Forced Monster Spawn! -> '${monster.name}'`
      );

      return { success: true, monster };
    } catch (messageError) {
      logger.error("Error sending forced spawn message:", messageError);

      // Fallback: try direct channel send
      try {
        await spawnChannel.send({ embeds: [embed] });
        logger.info(`Forced spawn message sent via fallback for ${monster.name}`);
        return { success: true, monster };
      } catch (fallbackError) {
        logger.error("Fallback forced spawn message also failed:", fallbackError);
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

    return {
      hasSpawnData: true,
      lastSpawnTime: spawnData.spawn_data.spawned_at,
      timeSinceSpawn,
      nextSpawnWindow,
      canSpawn: timeSinceSpawn > nextSpawnWindow,
      lastMonster: spawnData.spawn_data.monster?.name?.english || "Unknown",
    };
  } catch (error) {
    logger.error(`Error getting spawn stats for guild ${guildId}:`, error);
    return { hasSpawnData: false, error: error.message };
  }
}

// Export utility functions for testing
export {
  WILD_ENCOUNTER_PHRASES, createSpawnEmbed,
  findSpawnableMonster, generateSpawnTimer, getRandomEncounterPhrase, getRandomPokemonId, isMonsterBoosted, isValidMonster
};

