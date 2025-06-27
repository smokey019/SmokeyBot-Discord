import {
  EmbedBuilder,
  Guild,
  TextChannel,
  User,
  type CommandInteraction,
} from "discord.js";
import { xp_cache } from "../../clients/cache";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import { getCurrentTime, getRndInteger } from "../../utils";
import { spawnChannelMessage } from "../message_queue";
import { getItemDB } from "./items";
import {
  findMonsterByID,
  getPokemonDisplayName,
  getPokemonEvolutionInfo,
  getPokemonSpecies,
  getPokemonSprites,
  getRandomValidPokemon,
  getUserMonster,
  type Pokemon
} from "./monsters";
import { rollShiny } from "./utils";

const logger = getLogger("ExpGain");

// Constants for better maintainability
const MAX_LEVEL = 100;
const EXP_PER_LEVEL = 1250;
const MIN_EXP_GAIN = 50;
const MAX_EXP_GAIN = 620;
const EGG_HATCH_LEVEL = 50;
const MIN_HATCH_LEVEL = 1;
const MAX_HATCH_LEVEL = 5;
const MIN_HATCH_EXP = 69;
const MAX_HATCH_EXP = 420;
const EVERSTONE_ITEM_ID = 229; // Item that prevents evolution
const EGG_ID = 0.1; // Local Egg ID, does not actually exist in Pokemon/PokeAPI
const MIN_EXP_TIMER = 5;
const MAX_EXP_TIMER = 300;

// Enhanced evolution interface using monsters.ts types
interface ProcessedEvolution {
  pokemon: Pokemon;
  species: any;
  minLevel: number;
  evolutionMethod: string;
}

/**
 * Check if Pokemon is an egg based on its ID
 * @param monster - Monster database model
 * @returns boolean indicating if it's an egg
 */
function isEgg(monster: IMonsterModel): boolean {
  return monster.monster_id === EGG_ID;
}

/**
 * Get the best sprite URL for a Pokemon using existing sprite functions
 * @param pokemon - Pokemon API data
 * @param isShiny - Whether the Pokemon is shiny
 * @returns Best available sprite URL
 */
function getBestPokemonSpriteUrl(pokemon: Pokemon, isShiny: boolean): string {
  const sprites = getPokemonSprites(pokemon, isShiny);

  // Use existing sprite priority: artwork > showdown > default
  return sprites.artwork || sprites.showdown || sprites.default || "";
}

/**
 * Check if Pokemon can evolve at current level using existing evolution functions
 * @param pokemon - Current Pokemon data
 * @param currentLevel - Pokemon's current level
 * @param hasEverstone - Whether Pokemon holds an Everstone
 * @returns Possible evolution or null
 */
async function checkForEvolution(
  pokemon: Pokemon,
  currentLevel: number,
  hasEverstone: boolean
): Promise<ProcessedEvolution | null> {
  if (hasEverstone) {
    logger.debug(`Evolution prevented by Everstone for ${getPokemonDisplayName(pokemon)}`);
    return null;
  }

  try {
    // Use existing comprehensive evolution function
    const evolutionInfo = await getPokemonEvolutionInfo(pokemon.id);

    if (!evolutionInfo.evolutions || evolutionInfo.evolutions.length === 0) {
      return null;
    }

    // Find level-based evolutions
    const evolutionMethods = evolutionInfo.evolutionMethods || [];

    for (let i = 0; i < evolutionInfo.evolutions.length; i++) {
      const evolutionName = evolutionInfo.evolutions[i];
      const method = evolutionMethods[i];

      // Check if this is a level-based evolution
      if (method && method.toLowerCase().includes('level')) {
        const levelMatch = method.match(/level (\d+)/i);
        const requiredLevel = levelMatch ? parseInt(levelMatch[1]) : null;

        if (requiredLevel && currentLevel >= requiredLevel) {
          // Find the evolution Pokemon by name
          try {
            // Convert display name back to API format for searching
            const searchName = evolutionName.toLowerCase().replace(/\s+/g, '-');

            // Try to find by name first, then by scanning IDs if needed
            let evolvedPokemon: Pokemon | null = null;

            // Simple approach: try common ID ranges based on the current Pokemon
            const searchStart = Math.max(1, pokemon.id - 10);
            const searchEnd = Math.min(1025, pokemon.id + 50);

            for (let id = searchStart; id <= searchEnd; id++) {
              const candidate = await findMonsterByID(id);
              if (candidate && getPokemonDisplayName(candidate).toLowerCase() === evolutionName.toLowerCase()) {
                evolvedPokemon = candidate;
                break;
              }
            }

            if (!evolvedPokemon) {
              logger.warn(`Could not find evolution Pokemon: ${evolutionName}`);
              continue;
            }

            const evolvedSpecies = await getPokemonSpecies(evolvedPokemon.id);

            return {
              pokemon: evolvedPokemon,
              species: evolvedSpecies,
              minLevel: requiredLevel,
              evolutionMethod: method,
            };
          } catch (error) {
            logger.warn(`Error finding evolution ${evolutionName}:`, error);
            continue;
          }
        }
      }
    }

    return null;
  } catch (error) {
    logger.error(`Error checking evolution for ${getPokemonDisplayName(pokemon)}:`, error);
    return null;
  }
}

/**
 * Handle Pokemon evolution with improved messaging
 * @param monster - Monster database model
 * @param currentPokemon - Current Pokemon API data
 * @param evolution - Evolution data
 * @param user - Discord user
 * @param interaction - Command interaction (optional)
 */
async function handleEvolution(
  monster: IMonsterModel,
  currentPokemon: Pokemon,
  evolution: ProcessedEvolution,
  user: User,
  interaction?: CommandInteraction
): Promise<void> {
  try {
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ monster_id: evolution.pokemon.id });

    if (!updateResult) {
      logger.error(`Failed to update monster ${monster.id} for evolution`);
      return;
    }

    // Get sprite URLs using existing sprite functions
    const evolvedSpriteUrl = getBestPokemonSpriteUrl(evolution.pokemon, Boolean(monster.shiny));
    const originalSpriteUrl = getBestPokemonSpriteUrl(currentPokemon, Boolean(monster.shiny));

    // Get display names using existing function
    const originalName = getPokemonDisplayName(currentPokemon);
    const evolvedName = getPokemonDisplayName(evolution.pokemon);

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s ${originalName} is evolving!`)
      .setDescription(
        `✨ **${originalName}** has evolved into **${evolvedName}**! ✨\n\n` +
        `Evolution triggered by: **${evolution.evolutionMethod}**` +
        (monster.shiny ? "\n⭐ *Your shiny Pokemon remains shiny!*" : "")
      )
      .setImage(evolvedSpriteUrl)
      .setThumbnail(originalSpriteUrl)
      .setColor(monster.shiny ? 0xffd700 : 0x00ff00)
      .setTimestamp()
      .setFooter({ text: `Level ${monster.level} → Level ${monster.level}` });

    // Send evolution message using the message queue
    if (interaction) {
      try {
        await spawnChannelMessage(embed, interaction, 3); // High priority for evolutions
        logger.info(
          `${user.username}'s ${originalName} evolved into ${evolvedName}!`
        );
      } catch (messageError) {
        logger.error("Failed to send evolution message via queue:", messageError);

        // Fallback: try direct channel send
        await sendFallbackMessage(embed, interaction);
      }
    }
  } catch (error) {
    logger.error(`Error handling evolution for monster ${monster.id}:`, error);
  }
}

/**
 * Handle egg hatching with improved Pokemon selection
 * @param monster - Monster database model
 * @param currentPokemon - Current Pokemon (egg) API data
 * @param user - Discord user
 * @param interaction - Command interaction (optional)
 */
async function handleEggHatch(
  monster: IMonsterModel,
  currentPokemon: Pokemon,
  user: User,
  interaction?: CommandInteraction
): Promise<void> {
  try {
    // Use existing function to get a random valid Pokemon
    const newPokemon = await getRandomValidPokemon();

    if (!newPokemon) {
      logger.error("Failed to find valid Pokemon for egg hatching");
      return;
    }

    // Determine shiny status with enhanced logic
    let isShiny = Boolean(monster.shiny); // Inherit egg's shiny status

    // Give extra shiny chance for egg hatching if not already shiny
    if (!isShiny) {
      isShiny = rollShiny() === 1;

      // Give a second chance for eggs (eggs are rare!)
      if (!isShiny) {
        isShiny = rollShiny() === 1;
      }
    }

    // Determine level and experience for hatched Pokemon
    const hatchLevel = getRndInteger(MIN_HATCH_LEVEL, MAX_HATCH_LEVEL);
    const hatchExp = getRndInteger(MIN_HATCH_EXP, MAX_HATCH_EXP);

    // Update the monster in database
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({
        monster_id: newPokemon.id,
        level: hatchLevel,
        experience: hatchExp,
        shiny: isShiny ? 1 : 0,
        egg: 0, // No longer an egg
        hatched_at: Date.now(),
      });

    if (!updateResult) {
      logger.error(`Failed to update monster ${monster.id} for egg hatching`);
      return;
    }

    // Get sprite URL using existing function
    const spriteUrl = getBestPokemonSpriteUrl(newPokemon, isShiny);

    // Get display names using existing function
    const eggName = getPokemonDisplayName(currentPokemon);
    const hatchedName = getPokemonDisplayName(newPokemon);

    // Get Pokemon species for additional info
    const species = await getPokemonSpecies(newPokemon.id);
    const isLegendary = species?.is_legendary || species?.is_mythical;

    const embed = new EmbedBuilder()
      .setTitle(`🥚 ${user.username}'s ${eggName} has hatched! 🐣`)
      .setDescription(
        `**Congratulations!** Your **${eggName}** has hatched into a **${hatchedName}**!` +
        (isShiny ? "\n✨ **It's shiny!** ✨" : "") +
        (isLegendary ? "\n💠 **It's a legendary Pokémon!** 💠" : "") +
        `\n\n**Level:** ${hatchLevel}\n**Experience:** ${hatchExp}`
      )
      .setImage(spriteUrl)
      .setColor(isShiny ? 0xffd700 : isLegendary ? 0xff6b9d : 0x87ceeb)
      .setTimestamp()
      .setFooter({ text: "Egg Hatched Successfully!" });

    // Send hatch message using the message queue
    if (interaction) {
      try {
        await spawnChannelMessage(embed, interaction, 3); // High priority for hatching
        logger.info(
          `${user.username}'s egg hatched into ${hatchedName}${isShiny ? " (shiny)" : ""}!`
        );
      } catch (messageError) {
        logger.error("Failed to send hatch message via queue:", messageError);

        // Fallback: try direct channel send
        await sendFallbackMessage(embed, interaction);
      }
    }
  } catch (error) {
    logger.error(`Error handling egg hatch for monster ${monster.id}:`, error);
  }
}

/**
 * Fallback message sending when queue fails
 * @param embed - Embed to send
 * @param interaction - Command interaction
 */
async function sendFallbackMessage(
  embed: EmbedBuilder,
  interaction: CommandInteraction
): Promise<void> {
  try {
    // Try multiple channel name variations
    const channelNames = ["pokémon-spawns", "pokemon-spawns", "spawns", "pokemon"];
    let monsterChannel: TextChannel | undefined;

    for (const channelName of channelNames) {
      monsterChannel = interaction.guild?.channels.cache.find(
        (ch) => ch.name === channelName
      ) as TextChannel;

      if (monsterChannel) break;
    }

    if (monsterChannel) {
      await monsterChannel.send({ embeds: [embed] });
    } else {
      // Last resort: send to interaction channel
      if (interaction.channel instanceof TextChannel) {
        await interaction.channel.send({ embeds: [embed] });
      }
    }
  } catch (fallbackError) {
    logger.error("All message sending methods failed:", fallbackError);
  }
}

/**
 * Check if a monster qualifies for experience gain
 * @param monster - Monster to check
 * @returns boolean indicating if monster can gain experience
 */
function canGainExperience(monster: IMonsterModel): boolean {
  return monster.level < MAX_LEVEL && !isEgg(monster);
}

/**
 * Calculate level up requirements
 * @param currentLevel - Current level
 * @param currentExp - Current experience
 * @param expGain - Experience being gained
 * @returns Object with level up information
 */
function calculateLevelUp(
  currentLevel: number,
  currentExp: number,
  expGain: number
): {
  willLevelUp: boolean;
  newLevel: number;
  requiredExp: number;
  totalExp: number;
} {
  const requiredExp = currentLevel * EXP_PER_LEVEL;
  const totalExp = currentExp + expGain;
  const willLevelUp = totalExp >= requiredExp;
  const newLevel = willLevelUp ? currentLevel + 1 : currentLevel;

  return {
    willLevelUp,
    newLevel,
    requiredExp,
    totalExp,
  };
}

/**
 * Main experience gain function with improved Pokemon integration
 * @param user - Discord user
 * @param guild - Discord guild
 * @param interaction - Command interaction (optional)
 */
export async function checkExpGain(
  user: User,
  guild: Guild,
  interaction?: CommandInteraction
): Promise<void> {
  const timestamp = getCurrentTime();
  const cacheKey = `${user.id}:${guild.id}`;
  const cache = await xp_cache.get(cacheKey);

  if (cache === undefined) {
    xp_cache.set(cacheKey, getCurrentTime());
    return;
  }

  // Check if enough time has passed for experience gain
  const expTimer = getRndInteger(MIN_EXP_TIMER, MAX_EXP_TIMER);
  if (timestamp - parseInt(cache) <= expTimer) {
    return;
  }

  try {
    const tmpUser = await getUser(user.id);
    if (!tmpUser?.current_monster) {
      xp_cache.set(cacheKey, getCurrentTime());
      return;
    }

    const monster = await getUserMonster(tmpUser.current_monster);
    if (!monster) {
      xp_cache.set(cacheKey, getCurrentTime());
      return;
    }

    // Check if monster can gain experience
    if (!canGainExperience(monster)) {
      xp_cache.set(cacheKey, getCurrentTime());
      return;
    }

    // Get Pokemon data from API using existing function
    const pokemonData = await findMonsterByID(monster.monster_id);
    if (!pokemonData) {
      logger.error(`Could not fetch Pokemon data for monster ${monster.id}`);
      xp_cache.set(cacheKey, getCurrentTime());
      return;
    }

    // Get held item data
    const heldItem = monster.held_item ? await getItemDB(monster.held_item) : null;
    const hasEverstone = heldItem?.item_number === EVERSTONE_ITEM_ID;

    // Update cache immediately to prevent spam
    xp_cache.set(cacheKey, getCurrentTime());

    // Calculate experience gain
    const expGain = getRndInteger(MIN_EXP_GAIN, MAX_EXP_GAIN);
    const levelUpInfo = calculateLevelUp(monster.level, monster.experience, expGain);

    // Update experience in database
    const updateExpResult = await databaseClient(MonsterTable)
      .where({ id: tmpUser.current_monster })
      .increment("experience", expGain);

    if (!updateExpResult) {
      logger.error(`Failed to update experience for monster ${monster.id}`);
      return;
    }

    logger.trace(
      `User ${user.username} gained ${expGain} XP in ${guild.name}.`
    );

    // Handle level up
    if (levelUpInfo.willLevelUp) {
      const updateLevelResult = await databaseClient<IMonsterModel>(MonsterTable)
        .where({ id: monster.id })
        .increment("level", 1);

      if (!updateLevelResult) {
        logger.error(`Failed to update level for monster ${monster.id}`);
        return;
      }

      const pokemonName = getPokemonDisplayName(pokemonData);

      logger.trace(
        `${user.username}'s ${pokemonName} leveled up to ${levelUpInfo.newLevel}!`
      );

      // Check for egg hatching
      if (isEgg(monster) && levelUpInfo.newLevel >= EGG_HATCH_LEVEL) {
        await handleEggHatch(monster, pokemonData, user, interaction);
        return; // Exit early as monster has transformed
      }

      // Check for evolution (only if not an egg and doesn't have Everstone)
      if (!isEgg(monster) && !hasEverstone) {
        const evolution = await checkForEvolution(
          pokemonData,
          levelUpInfo.newLevel,
          hasEverstone
        );

        if (evolution) {
          await handleEvolution(monster, pokemonData, evolution, user, interaction);
        }
      }
    }
  } catch (error) {
    logger.error(`Error in checkExpGain for user ${user.id}:`, error);
    // Still update cache to prevent repeated errors
    xp_cache.set(cacheKey, getCurrentTime());
  }
}

/**
 * Force evolve a Pokemon (admin/testing function)
 * @param monsterId - Monster database ID
 * @param user - Discord user
 * @param interaction - Command interaction
 * @returns Success boolean
 */
export async function forceEvolution(
  monsterId: number,
  user: User,
  interaction: CommandInteraction
): Promise<boolean> {
  try {
    const monster = await getUserMonster(monsterId);
    if (!monster) {
      logger.error(`Monster ${monsterId} not found for force evolution`);
      return false;
    }

    const pokemonData = await findMonsterByID(monster.monster_id);
    if (!pokemonData) {
      logger.error(`Pokemon data not found for monster ${monsterId}`);
      return false;
    }

    const evolution = await checkForEvolution(pokemonData, monster.level, false);
    if (!evolution) {
      logger.info(`No evolution available for monster ${monsterId}`);
      return false;
    }

    await handleEvolution(monster, pokemonData, evolution, user, interaction);
    return true;
  } catch (error) {
    logger.error(`Error in forceEvolution for monster ${monsterId}:`, error);
    return false;
  }
}

/**
 * Force hatch an egg (admin/testing function)
 * @param monsterId - Monster database ID (must be an egg)
 * @param user - Discord user
 * @param interaction - Command interaction
 * @returns Success boolean
 */
export async function forceHatch(
  monsterId: number,
  user: User,
  interaction: CommandInteraction
): Promise<boolean> {
  try {
    const monster = await getUserMonster(monsterId);
    if (!monster) {
      logger.error(`Monster ${monsterId} not found for force hatch`);
      return false;
    }

    if (!isEgg(monster)) {
      logger.error(`Monster ${monsterId} is not an egg`);
      return false;
    }

    const pokemonData = await findMonsterByID(monster.monster_id);
    if (!pokemonData) {
      logger.error(`Pokemon data not found for monster ${monsterId}`);
      return false;
    }

    await handleEggHatch(monster, pokemonData, user, interaction);
    return true;
  } catch (error) {
    logger.error(`Error in forceHatch for monster ${monsterId}:`, error);
    return false;
  }
}

/**
 * Get experience statistics for a user
 * @param userId - User ID
 * @returns Experience statistics
 */
export async function getExpStats(userId: string): Promise<{
  totalMonsters: number;
  maxLevelMonsters: number;
  averageLevel: number;
  totalExperience: number;
  eggsRemaining: number;
} | null> {
  try {
    const monsters = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where({ uid: userId, released: 0 });

    if (!monsters.length) {
      return null;
    }

    let totalExperience = 0;
    let totalLevel = 0;
    let maxLevelCount = 0;
    let eggCount = 0;

    monsters.forEach((monster) => {
      totalExperience += monster.experience;
      totalLevel += monster.level;

      if (monster.level >= MAX_LEVEL) {
        maxLevelCount++;
      }

      if (isEgg(monster)) {
        eggCount++;
      }
    });

    return {
      totalMonsters: monsters.length,
      maxLevelMonsters: maxLevelCount,
      averageLevel: Math.round(totalLevel / monsters.length),
      totalExperience,
      eggsRemaining: eggCount,
    };
  } catch (error) {
    logger.error(`Error getting exp stats for user ${userId}:`, error);
    return null;
  }
}

// Export utility functions for testing and backwards compatibility
export {
  calculateLevelUp,
  canGainExperience, checkForEvolution,
  getBestPokemonSpriteUrl,
  isEgg
};
