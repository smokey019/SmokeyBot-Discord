import { CommandInteraction, EmbedBuilder } from "discord.js";
import { GLOBAL_COOLDOWN, getGCD } from "../../clients/cache";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { getCurrentTime, getRndInteger } from "../../utils";
import { queueMessage } from "../message_queue";
import { userDex } from "./info";
import {
  getPokemonDisplayName,
  getPokemonSprites,
  type Pokemon
} from "./monsters";
import { getRandomNature } from "./natures";
import { getSpawn, updateSpawn } from "./spawn-monster";
import { rollGender, rollLevel, rollPerfectIV, rollShiny } from "./utils";

const logger = getLogger("Pokémon-Catch");

// Constants for better maintainability
const CATCH_RESPONSES = ["YOINK", "YOINKERS", "NICE", "NOICE", "Congrats"] as const;
const WRONG_POKEMON_COOLDOWN = 5; // seconds
const BASE_EXPERIENCE_MULTIPLIER = 1250;
const MAX_IV = 31;
const PERFECT_IV_MIN = 28;
const MAX_IV_TOTAL = 186; // 31 * 6 stats
const CATCH_CURRENCY_REWARD = 10;
const NEW_POKEMON_BONUS = 100;
const SHINY_BONUS = 1000;
const STREAK_BONUS = 250;
const STREAK_RESET_COUNT = 10;

// Enhanced error types
class CatchError extends Error {
  constructor(message: string, public code: string, public userId?: string) {
    super(message);
    this.name = 'CatchError';
  }
}

// Type definitions for better type safety
interface SpawnData {
  monster: {
    id: number;
    name: string;
    sprites: {
      other: {
        "official-artwork": {
          front_default: string;
          front_shiny: string;
        };
      };
    };
  } | null;
}

interface CatchResult {
  success: boolean;
  isNew: boolean;
  isShiny: boolean;
  response: string;
  monster?: IMonsterModel;
  insertedId?: number;
}

/**
 * Special Pokemon names that can maintain hyphens
 */
const HYPHENATED_POKEMON_EXCEPTIONS = new Set([
  // Treasures of Ruin (confirmed to have hyphens in canonical names)
  "chi-yu",
  "ting-lu",
  "chien-pao",
  "wo-chien",

  // Legendary with hyphen
  "ho-oh",

  // Kommo-o evolution line (confirmed to have hyphens)
  "kommo-o",
  "hakamo-o",
  "jangmo-o",

  // Other confirmed hyphenated names
  "porygon-z",
]);

/**
 * Pokemon names that need space replacement instead of hyphen removal
 */
const SPACE_REPLACEMENT_POKEMON = new Set([
  "sandy-shocks",
  "mr-rime"
]);

/**
 * Returns true if the input matches any of the currently spawned monster names.
 * Supports multiple languages and handles regional variants.
 *
 * @param interactionContent User input to match
 * @param Pokemon Monster dex entry to match against
 * @returns Boolean indicating if names match
 */
function monsterMatchesPrevious(
  interactionContent: string,
  { name }: Pokemon
): boolean {
  if (!interactionContent || !name) {
    return false;
  }

  const userInput = interactionContent.toLowerCase().trim();

  // Create an array of possible name variations
  const nameVariations = [
    name
  ].filter(Boolean); // Remove any undefined/null names

  // Check each name variation
  for (const nameVariation of nameVariations) {
    if (!nameVariation) continue;

    // Check exact match
    if (userInput === nameVariation.toLowerCase()) {
      return true;
    }

    // Check match with regional/gender markers removed
    const cleanedName = nameVariation
      .replace(/(♂|♀| RS| SS|Galarian |Alolan )/gi, "")
      .toLowerCase()
      .trim();

    if (userInput === cleanedName) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes Pokemon names by handling special cases with hyphens and spaces
 * This is specialized for catching mechanics and differs from the general normalization
 *
 * @param pokemonName Original Pokemon name
 * @returns Normalized Pokemon name
 */
function normalizePokemonNameForCatch(pokemonName: string): string {
  if (!pokemonName || typeof pokemonName !== 'string') {
    return '';
  }

  const lowerName = pokemonName.toLowerCase().trim();

  // Handle hyphenated exceptions
  if (HYPHENATED_POKEMON_EXCEPTIONS.has(lowerName)) {
    return lowerName;
  }

  return lowerName.replace("-", " ");
}

/**
 * Calculates average IV percentage from individual IV values
 *
 * @param ivStats Object containing individual IV values
 * @returns Average IV as a percentage (0-100)
 */
function calculateAverageIV(ivStats: {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
}): number {
  const totalIV = ivStats.hp + ivStats.attack + ivStats.defense +
    ivStats.sp_attack + ivStats.sp_defense + ivStats.speed;

  return parseFloat(((totalIV / MAX_IV_TOTAL) * 100).toFixed(2));
}

/**
 * Generates random IV stats for a Pokemon
 *
 * @param isPerfect Whether to generate high IV stats
 * @returns Object containing IV values
 */
function generateIVStats(isPerfect: boolean = false) {
  const minIV = isPerfect ? PERFECT_IV_MIN : 1;
  const maxIV = MAX_IV;

  return {
    hp: getRndInteger(minIV, maxIV),
    attack: getRndInteger(minIV, maxIV),
    defense: getRndInteger(minIV, maxIV),
    sp_attack: getRndInteger(minIV, maxIV),
    sp_defense: getRndInteger(minIV, maxIV),
    speed: getRndInteger(minIV, maxIV)
  };
}

/**
 * Creates a monster object with all required properties
 *
 * @param spawnData Current spawn information
 * @param userId Discord user ID
 * @returns Complete monster object ready for database insertion
 */
function createMonsterObject(spawnData: SpawnData['monster'], userId: string): IMonsterModel {
  if (!spawnData) {
    throw new CatchError('Invalid spawn data provided', 'INVALID_SPAWN_DATA', userId);
  }

  const level = rollLevel(1, 49);
  const shiny = rollShiny();
  const gender = rollGender();
  const isPerfect = rollPerfectIV();
  const isEgg = 0; // Currently disabled based on commented code

  const ivStats = generateIVStats(isPerfect);
  const averageIV = calculateAverageIV(ivStats);

  const monster: IMonsterModel = {
    monster_id: spawnData.id,
    ...ivStats,
    nature: getRandomNature(),
    experience: level * BASE_EXPERIENCE_MULTIPLIER,
    level: level,
    uid: userId,
    original_uid: userId,
    shiny: shiny,
    captured_at: Date.now(),
    gender: gender,
    egg: isEgg,
    avg_iv: averageIV
  };

  return monster;
}

/**
 * Handles database operations for catching a monster
 *
 * @param monster Monster object to insert
 * @param userId Discord user ID
 * @returns Database operation results
 */
async function handleDatabaseOperations(monster: IMonsterModel, userId: string) {
  try {
    // Insert the monster
    const insertMonster = await databaseClient<IMonsterModel>(MonsterTable).insert(monster);

    if (!insertMonster || insertMonster.length === 0) {
      throw new CatchError('Failed to insert monster into database', 'DB_INSERT_FAILED', userId);
    }

    const insertedId = insertMonster[0];

    // Update user data
    const updateUser = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: userId })
      .update({ latest_monster: insertedId })
      .increment("currency", CATCH_CURRENCY_REWARD)
      .increment("streak", 1);

    // Create user record if it doesn't exist
    if (!updateUser) {
      logger.debug(`User ${userId} not found, creating new user record`);

      await databaseClient<IMonsterUserModel>(MonsterUserTable).insert({
        current_monster: insertedId,
        latest_monster: insertedId,
        uid: userId,
        dex: "[]",
      });

      logger.debug(`Successfully created user record for ${userId}`);
    }

    return { insertedId, userUpdated: true };
  } catch (error) {
    logger.error(`Database operations failed for user ${userId}:`, error);
    throw new CatchError('Database operations failed', 'DB_OPERATION_FAILED', userId);
  }
}

/**
 * Handles currency bonuses based on catch conditions
 *
 * @param userId Discord user ID
 * @param isShiny Whether the caught Pokemon is shiny
 * @param isNewPokemon Whether this is a new Pokemon for the user
 */
async function handleCurrencyBonuses(userId: string, isShiny: boolean, isNewPokemon: boolean): Promise<void> {
  try {
    // Handle new Pokemon bonus
    if (isNewPokemon && !isShiny) {
      await databaseClient<IMonsterUserModel>(MonsterUserTable)
        .where({ uid: userId })
        .increment("currency", NEW_POKEMON_BONUS);
    }

    // Handle shiny bonus
    if (isShiny) {
      await databaseClient<IMonsterUserModel>(MonsterUserTable)
        .where({ uid: userId })
        .increment("currency", SHINY_BONUS);
    }

    // Handle streak bonus
    const user = await getUser(userId);
    if (user?.streak === STREAK_RESET_COUNT) {
      await databaseClient<IMonsterUserModel>(MonsterUserTable)
        .where({ uid: userId })
        .update({ streak: 0 })
        .increment("currency", STREAK_BONUS);
    }
  } catch (error) {
    logger.error(`Failed to handle currency bonuses for user ${userId}:`, error);
    // Don't throw here - bonuses failing shouldn't break the catch
  }
}

/**
 * Generates the appropriate response message based on catch conditions
 *
 * @param monster Caught monster data
 * @param spawnData Original spawn data
 * @param isNewPokemon Whether this is a new Pokemon for the user
 * @param insertedId Database ID of the inserted monster
 * @returns Formatted response message
 */
function generateCatchResponse(
  monster: IMonsterModel,
  spawnData: SpawnData['monster'],
  isNewPokemon: boolean,
  insertedId: number
): string {
  if (!spawnData) {
    return "Error: Invalid spawn data";
  }

  // Use the display name function from monsters.ts for consistent formatting
  const pokemonName = getPokemonDisplayName({ name: spawnData.name } as Pokemon);
  const randomGrats = CATCH_RESPONSES[getRndInteger(0, CATCH_RESPONSES.length - 1)];
  const shinyEmoji = monster.shiny ? " ⭐" : "";
  const legendaryEmoji = ""; // Currently disabled based on commented code
  const averageIV = monster.avg_iv?.toFixed(2) || "0.00";

  let response = "";

  if (monster.shiny && isNewPokemon) {
    response = `_**POGGERS**_! You caught a __***SHINY***__ level **${monster.level} ${pokemonName}**${shinyEmoji + legendaryEmoji}! \n\n Avg IV: **${averageIV}**% \nPoké #${spawnData.id} - ID: **${insertedId}** \n\n **NEW POKéMON!** Added to Pokédex.`;
  } else if (!monster.shiny && isNewPokemon) {
    response = `**${randomGrats}**! You caught a level **${monster.level} ${pokemonName}**${shinyEmoji + legendaryEmoji}! \n\n Avg IV: **${averageIV}**% - Poké #${spawnData.id} - ID: **${insertedId}** - **NEW POKéMON!** Added to Pokédex.`;
  } else if (!monster.shiny && !isNewPokemon) {
    response = `**${randomGrats}**! You caught a level **${monster.level} ${pokemonName}**${shinyEmoji + legendaryEmoji}! Avg IV: **${averageIV}**% - ID: **${insertedId}**.`;
  } else if (monster.shiny && !isNewPokemon) {
    response = `_**POGGERS**_! You caught a __***SHINY***__ level **${monster.level} ${pokemonName}${shinyEmoji + legendaryEmoji}**! \n\n Avg IV: **${averageIV}**% \nID: **${insertedId}**.`;
  }

  return response;
}

/**
 * Creates and sends the appropriate Discord response (embed for shiny, text for normal)
 *
 * @param interaction Discord command interaction
 * @param response Response message text
 * @param monster Caught monster data
 * @param spawnData Original spawn data
 */
async function sendCatchResponse(
  interaction: CommandInteraction,
  response: string,
  monster: IMonsterModel,
  spawnData: SpawnData['monster']
): Promise<void> {
  try {
    if (monster.shiny && spawnData) {
      // Use the sprite function from monsters.ts for better sprite handling
      const sprites = getPokemonSprites({ sprites: spawnData.sprites } as Pokemon, true);
      const shinySprite = sprites.artwork || sprites.default;

      if (shinySprite) {
        const pokemonName = getPokemonDisplayName({ name: spawnData.name } as Pokemon);

        const embed = new EmbedBuilder()
          .setTitle("⭐ " + pokemonName + " ⭐")
          .setDescription(response)
          .setImage(shinySprite)
          .setTimestamp();

        await queueMessage({ embeds: [embed] }, interaction, true);
        return;
      }
    }

    // Fallback to text response
    await queueMessage(response, interaction, true);
  } catch (error) {
    logger.error('Failed to send catch response:', error);
    // Fallback to simple text response
    try {
      await queueMessage("Pokémon caught successfully!", interaction, true);
    } catch (fallbackError) {
      logger.error('Failed to send fallback response:', fallbackError);
    }
  }
}

/**
 * Validates spawn data to ensure it's ready for catching
 *
 * @param spawn Spawn data to validate
 * @returns Boolean indicating if spawn is valid
 */
function validateSpawnData(spawn: SpawnData): boolean {
  return !!(
    spawn?.monster?.name &&
    spawn.monster.id &&
    typeof spawn.monster.name === 'string'
  );
}

/**
 * Main catch function - handles the complete Pokemon catching process
 *
 * @param interaction Discord command interaction
 */
export async function catchMonster(interaction: CommandInteraction): Promise<void> {
  // Initial response to prevent interaction timeout
  await interaction.reply(
    "https://cdn.discordapp.com/emojis/753418888376614963.webp?size=96&quality=lossless"
  );

  const timestamp = getCurrentTime();
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  if (!guildId) {
    await queueMessage("Error: Unable to determine server context.", interaction, true);
    return;
  }

  try {
    // Get global cooldown and spawn data
    const GCD = await getGCD(guildId);
    const spawnDataResponse = await getSpawn(guildId);
    const userAttempt = interaction.options.get("pokemon")?.value?.toString()?.toLowerCase()?.trim();

    if (!userAttempt) {
      await queueMessage("Please provide a Pokémon name to catch!", interaction, true);
      return;
    }

    if (!spawnDataResponse?.spawn_data) {
      await queueMessage("No Pokémon is currently spawned!", interaction, true);
      return;
    }

    let spawn = spawnDataResponse.spawn_data;

    // Validate and clean spawn data
    if (!validateSpawnData(spawn)) {
      logger.warn(`Invalid spawn data detected for guild ${guildId}`);
      spawn.monster = null;
      await updateSpawn(guildId, spawn);
      await queueMessage("No Pokémon is currently spawned!", interaction, true);
      return;
    }

    // Normalize the spawned Pokemon name using the specialized function
    const normalizedSpawnName = normalizePokemonNameForCatch(spawn.monster!.name);
    spawn.monster!.name = normalizedSpawnName;

    // Check if user's attempt matches the spawned Pokemon
    logger.error(userAttempt);
    logger.error(normalizedSpawnName);

    if (userAttempt === normalizedSpawnName) {
      logger.trace(`${interaction.guild?.name} - ${interaction.user.username} | Starting catch process`);

      try {
        // Get user's current dex for new Pokemon detection
        const userDexData = await userDex(userId);
        const isNewPokemon = !userDexData.includes(spawn.monster!.id);

        // Create monster object
        const monster = createMonsterObject(spawn.monster, userId);

        // Clear the spawn
        const currentSpawn = spawn.monster;
        spawn.monster = null;
        await updateSpawn(guildId, spawn);

        // Handle database operations
        const { insertedId } = await handleDatabaseOperations(monster, userId);

        // Handle currency bonuses
        await handleCurrencyBonuses(userId, Boolean(monster.shiny), isNewPokemon);

        // Generate and send response
        const response = generateCatchResponse(monster, currentSpawn, isNewPokemon, insertedId);
        await sendCatchResponse(interaction, response, monster, currentSpawn);

        // Log the catch
        const logLevel = monster.shiny ? 'error' : 'info'; // 'error' for shiny to make it stand out
        const displayName = getPokemonDisplayName({ name: currentSpawn.name } as Pokemon);
        logger[logLevel](
          `${interaction.guild?.name} - ${interaction.user.username} caught a ${monster.shiny ? 'SHINY ' : ''}${displayName} (ID: ${insertedId})`
        );

      } catch (error) {
        logger.error(`Catch process failed for user ${userId}:`, error);
        await queueMessage("An error occurred while catching the Pokémon. Please try again!", interaction, true);
      }

    } else {
      // Wrong Pokemon - handle cooldown
      const timeSinceLastWrong = timestamp - (GCD || 0);

      if (timeSinceLastWrong > WRONG_POKEMON_COOLDOWN) {
        GLOBAL_COOLDOWN.set(guildId, getCurrentTime());
        await interaction.editReply("That is the wrong Pokémon!");
        logger.trace(`${interaction.user.username} guessed incorrectly: ${userAttempt} vs ${normalizedSpawnName}`);
      } else {
        // User is still on cooldown
        const remainingCooldown = WRONG_POKEMON_COOLDOWN - timeSinceLastWrong;
        await interaction.editReply(`Please wait ${remainingCooldown.toFixed(1)} more seconds before guessing again!`);
      }
    }

  } catch (error) {
    logger.error(`Critical error in catchMonster for user ${userId}:`, error);

    try {
      await queueMessage("A critical error occurred. Please contact an administrator if this persists.", interaction, true);
    } catch (replyError) {
      logger.error('Failed to send error response:', replyError);
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS (Additional exports for testing and debugging)
// ============================================================================

/**
 * Export for testing - validates if a user input matches a Pokemon name
 * @param userInput User's guess
 * @param pokemonData Pokemon data to match against
 * @returns Boolean indicating match
 */
export function validatePokemonGuess(userInput: string, pokemonData: Pokemon): boolean {
  return monsterMatchesPrevious(userInput, pokemonData);
}

/**
 * Export for testing - normalizes Pokemon names for catching
 * @param name Pokemon name to normalize
 * @returns Normalized name
 */
export function normalizeCatchName(name: string): string {
  return normalizePokemonNameForCatch(name);
}

/**
 * Export for testing - calculates IV average
 * @param ivs IV stats object
 * @returns Average IV percentage
 */
export function calculateIVAverage(ivs: {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
}): number {
  return calculateAverageIV(ivs);
}