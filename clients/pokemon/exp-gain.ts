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
  findMonsterByIDAPI,
  getPokemonSpecies,
  getRandomMonster,
  getUserMonster,
  type Pokemon,
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

// Cache for evolution data to avoid repeated API calls
const evolutionDataCache = new Map<
  number,
  {
    evolutions: EvolutionData[];
    timestamp: number;
  }
>();
const EVOLUTION_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Types for evolution handling
interface EvolutionData {
  id: number;
  name: string;
  minLevel?: number;
  triggerItem?: string;
  triggerCondition?: string;
}

interface ProcessedEvolution {
  pokemon: Pokemon;
  species: any;
  minLevel: number;
}

/**
 * Get Pokemon display name from API data
 * @param pokemon - Pokemon API response
 * @returns Formatted display name
 */
function getPokemonDisplayName(pokemon: Pokemon): string {
  if (!pokemon.name) return "Unknown Pokemon";

  return pokemon.name
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Check if Pokemon is an egg based on its ID
 * @param pokemon - Pokemon API response
 * @returns boolean indicating if it's an egg
 */
function isEgg(monster: IMonsterModel): boolean {
  return monster.monster_id === EGG_ID;
}

/**
 * Get evolution chain data from PokeAPI
 * @param speciesUrl - Species URL from Pokemon data
 * @returns Evolution chain data
 */
async function getEvolutionChain(speciesUrl: string): Promise<any> {
  try {
    // Extract species ID from URL
    const speciesId = speciesUrl.split("/").slice(-2)[0];
    const species = await getPokemonSpecies(parseInt(speciesId));

    if (!species?.evolution_chain?.url) {
      return null;
    }

    // Fetch evolution chain
    const evolutionChainId = species.evolution_chain.url
      .split("/")
      .slice(-2)[0];
    const response = await fetch(
      `https://pokeapi.co/api/v2/evolution-chain/${evolutionChainId}`
    );

    if (!response.ok) {
      throw new Error(`Evolution chain API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    logger.error("Error fetching evolution chain:", error);
    return null;
  }
}

/**
 * Parse evolution chain to find possible evolutions for a Pokemon
 * @param evolutionChain - Evolution chain data from API
 * @param currentPokemonName - Current Pokemon's name
 * @returns Array of possible evolutions
 */
function parseEvolutionChain(
  evolutionChain: any,
  currentPokemonName: string
): EvolutionData[] {
  const evolutions: EvolutionData[] = [];

  function traverseChain(chain: any): void {
    if (!chain) return;

    // Check if this is an evolution from our current Pokemon
    if (chain.species.name === currentPokemonName.toLowerCase()) {
      // Process all possible evolutions
      chain.evolves_to.forEach((evolution: any) => {
        const evolutionDetails = evolution.evolution_details[0]; // Take first evolution method

        if (evolutionDetails) {
          const pokemonId = parseInt(
            evolution.species.url.split("/").slice(-2)[0]
          );

          evolutions.push({
            id: pokemonId,
            name: evolution.species.name,
            minLevel: evolutionDetails.min_level,
            triggerItem: evolutionDetails.item?.name,
            triggerCondition: evolutionDetails.trigger?.name,
          });
        }
      });
    }

    // Continue traversing the chain
    chain.evolves_to.forEach((nextChain: any) => traverseChain(nextChain));
  }

  traverseChain(evolutionChain.chain);
  return evolutions;
}

/**
 * Get cached evolution data or fetch from API
 * @param pokemon - Current Pokemon data
 * @returns Array of possible evolutions
 */
async function getEvolutionData(pokemon: Pokemon): Promise<EvolutionData[]> {
  const cacheKey = pokemon.id;
  const cached = evolutionDataCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < EVOLUTION_CACHE_TTL) {
    return cached.evolutions;
  }

  try {
    const evolutionChain = await getEvolutionChain(pokemon.species.url);
    if (!evolutionChain) {
      evolutionDataCache.set(cacheKey, {
        evolutions: [],
        timestamp: Date.now(),
      });
      return [];
    }

    const evolutions = parseEvolutionChain(evolutionChain, pokemon.name);
    evolutionDataCache.set(cacheKey, { evolutions, timestamp: Date.now() });

    return evolutions;
  } catch (error) {
    logger.error(`Error getting evolution data for ${pokemon.name}:`, error);
    return [];
  }
}

/**
 * Check if Pokemon can evolve at current level
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
    logger.debug(`Evolution prevented by Everstone for ${pokemon.name}`);
    return null;
  }

  try {
    const evolutions = await getEvolutionData(pokemon);

    // Find level-based evolutions that the Pokemon qualifies for
    const levelEvolutions = evolutions.filter(
      (evo) =>
        evo.minLevel &&
        currentLevel >= evo.minLevel &&
        evo.triggerCondition === "level-up"
    );

    if (levelEvolutions.length === 0) {
      return null;
    }

    // Take the first valid evolution (could be enhanced to handle multiple)
    const evolution = levelEvolutions[0];

    // Fetch the evolution Pokemon data
    const [evolvedPokemon, evolvedSpecies] = await Promise.all([
      findMonsterByIDAPI(evolution.id),
      getPokemonSpecies(evolution.id),
    ]);

    if (!evolvedPokemon) {
      logger.warn(
        `Could not fetch evolution Pokemon data for ID ${evolution.id}`
      );
      return null;
    }

    return {
      pokemon: evolvedPokemon,
      species: evolvedSpecies,
      minLevel: evolution.minLevel!,
    };
  } catch (error) {
    logger.error(`Error checking evolution for ${pokemon.name}:`, error);
    return null;
  }
}

/**
 * Get Pokemon sprite URL based on shiny status
 * @param pokemon - Pokemon API data
 * @param isShiny - Whether the Pokemon is shiny
 * @returns Sprite URL
 */
function getPokemonSpriteUrl(pokemon: Pokemon, isShiny: boolean): string {
  const sprites = pokemon.sprites;

  if (isShiny) {
    return (
      sprites.other?.["official-artwork"]?.front_shiny ||
      sprites.front_shiny ||
      sprites.other?.["official-artwork"]?.front_default ||
      sprites.front_default ||
      ""
    );
  } else {
    return (
      sprites.other?.["official-artwork"]?.front_default ||
      sprites.front_default ||
      ""
    );
  }
}

/**
 * Handle Pokemon evolution
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

    // Get sprite URLs
    const evolvedSpriteUrl = getPokemonSpriteUrl(
      evolution.pokemon,
      Boolean(monster.shiny)
    );
    const originalSpriteUrl = getPokemonSpriteUrl(
      currentPokemon,
      Boolean(monster.shiny)
    );

    // Get display names
    const originalName = getPokemonDisplayName(currentPokemon);
    const evolvedName = getPokemonDisplayName(evolution.pokemon);

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s ${originalName} is evolving!`)
      .setDescription(
        `Nice! **${originalName}** has evolved into **${evolvedName}**!`
      )
      .setImage(evolvedSpriteUrl)
      .setThumbnail(originalSpriteUrl)
      .setColor(monster.shiny ? 0xffd700 : 0x00ff00)
      .setTimestamp();

    // Send evolution message using the message queue
    if (interaction) {
      try {
        await spawnChannelMessage(embed, interaction, 3); // High priority for evolutions
        logger.info(
          `${user.username}'s ${originalName} evolved into ${evolvedName}!`
        );
      } catch (messageError) {
        logger.error(
          "Failed to send evolution message via queue:",
          messageError
        );

        // Fallback: try direct channel send
        try {
          const monsterChannel = interaction.guild?.channels.cache.find(
            (ch) => ch.name === "pokémon-spawns" // Default channel name
          ) as TextChannel;

          if (monsterChannel) {
            await monsterChannel.send({ embeds: [embed] });
          }
        } catch (fallbackError) {
          logger.error(
            "Evolution message fallback also failed:",
            fallbackError
          );
        }
      }
    }
  } catch (error) {
    logger.error(`Error handling evolution for monster ${monster.id}:`, error);
  }
}

/**
 * Handle egg hatching
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
    // Get a random Pokemon that's not an egg
    let attempts = 0;
    let newPokemon: Pokemon | null = null;

    while (attempts < 10) {
      const randomId = getRandomMonster();
      const candidate = await findMonsterByIDAPI(randomId);

      if (candidate && !isEgg(monster)) {
        newPokemon = candidate;
        break;
      }
      attempts++;
    }

    if (!newPokemon) {
      logger.error("Failed to find valid Pokemon for egg hatching");
      return;
    }

    // Determine shiny status
    let isShiny = rollShiny();

    // Give extra shiny chance for egg hatching
    if (!isShiny && !monster.shiny) {
      isShiny = rollShiny();
    } else if (monster.shiny) {
      isShiny = 1;
    }

    // Update the monster in database
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({
        monster_id: newPokemon.id,
        level: getRndInteger(MIN_HATCH_LEVEL, MAX_HATCH_LEVEL),
        experience: getRndInteger(MIN_HATCH_EXP, MAX_HATCH_EXP),
        shiny: isShiny,
        hatched_at: Date.now(),
      });

    if (!updateResult) {
      logger.error(`Failed to update monster ${monster.id} for egg hatching`);
      return;
    }

    // Get sprite URL
    const spriteUrl = getPokemonSpriteUrl(newPokemon, Boolean(isShiny));

    // Get display names
    const eggName = getPokemonDisplayName(currentPokemon);
    const hatchedName = getPokemonDisplayName(newPokemon);

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s ${eggName} has hatched!`)
      .setDescription(
        `YO! **${eggName}** has HATCHED into **${hatchedName}**! Congratulations!${
          isShiny ? " ✨ It's shiny! ✨" : ""
        }`
      )
      .setImage(spriteUrl)
      .setColor(isShiny ? 0xffd700 : 0x87ceeb)
      .setTimestamp();

    // Send hatch message using the message queue
    if (interaction) {
      try {
        await spawnChannelMessage(embed, interaction, 3); // High priority for hatching
        logger.info(
          `${user.username}'s egg hatched into ${hatchedName}${
            isShiny ? " (shiny)" : ""
          }!`
        );
      } catch (messageError) {
        logger.error("Failed to send hatch message via queue:", messageError);

        // Fallback: try direct channel send
        try {
          const monsterChannel = interaction.guild?.channels.cache.find(
            (ch) => ch.name === "pokémon-spawns" // Default channel name
          ) as TextChannel;

          if (monsterChannel) {
            await monsterChannel.send({ embeds: [embed] });
          }
        } catch (fallbackError) {
          logger.error("Hatch message fallback also failed:", fallbackError);
        }
      }
    }
  } catch (error) {
    logger.error(`Error handling egg hatch for monster ${monster.id}:`, error);
  }
}

/**
 * Main experience gain function with PokeAPI integration
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
    if (!monster || monster.level >= MAX_LEVEL) {
      xp_cache.set(cacheKey, getCurrentTime());
      return;
    }

    // Get Pokemon data from API
    const pokemonData = await findMonsterByIDAPI(monster.monster_id);
    if (!pokemonData) {
      logger.error(`Could not fetch Pokemon data for monster ${monster.id}`);
      xp_cache.set(cacheKey, getCurrentTime());
      return;
    }

    // Get held item data
    const heldItem = monster.held_item
      ? await getItemDB(monster.held_item)
      : null;
    const hasEverstone = heldItem?.item_number === EVERSTONE_ITEM_ID;

    // Update cache immediately to prevent spam
    xp_cache.set(cacheKey, getCurrentTime());

    // Gain experience
    const expGain = getRndInteger(MIN_EXP_GAIN, MAX_EXP_GAIN);
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

    // Check for level up
    const requiredExp = monster.level * EXP_PER_LEVEL;
    if (monster.experience + expGain >= requiredExp) {
      const updateLevelResult = await databaseClient<IMonsterModel>(
        MonsterTable
      )
        .where({ id: monster.id })
        .increment("level", 1);

      if (!updateLevelResult) {
        logger.error(`Failed to update level for monster ${monster.id}`);
        return;
      }

      const newLevel = monster.level + 1;
      const pokemonName = getPokemonDisplayName(pokemonData);

      logger.trace(
        `${user.username}'s ${pokemonName} leveled up to ${newLevel}!`
      );

      // Check for evolution or egg hatching
      if (isEgg(monster) && newLevel >= EGG_HATCH_LEVEL) {
        await handleEggHatch(monster, pokemonData, user, interaction);
      } else if (!hasEverstone) {
        const evolution = await checkForEvolution(
          pokemonData,
          newLevel,
          hasEverstone
        );
        if (evolution) {
          await handleEvolution(
            monster,
            pokemonData,
            evolution,
            user,
            interaction
          );
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
 * Clear evolution cache (for memory management)
 */
export function clearEvolutionCache(): void {
  evolutionDataCache.clear();
  logger.info("Evolution cache cleared");
}

/**
 * Get evolution cache statistics
 */
export function getEvolutionCacheStats(): {
  size: number;
  memoryUsage: string;
} {
  const memoryUsage = `${Math.round(
    JSON.stringify([...evolutionDataCache.values()]).length / 1024
  )} KB`;

  return {
    size: evolutionDataCache.size,
    memoryUsage,
  };
}

/**
 * Pre-warm evolution cache for commonly used Pokemon
 * @param pokemonIds - Array of Pokemon IDs to cache
 */
export async function preWarmEvolutionCache(
  pokemonIds: number[]
): Promise<void> {
  logger.info(
    `Pre-warming evolution cache with ${pokemonIds.length} Pokemon...`
  );

  for (const id of pokemonIds) {
    try {
      const pokemon = await findMonsterByIDAPI(id);
      if (pokemon) {
        await getEvolutionData(pokemon);
      }
    } catch (error) {
      logger.warn(
        `Failed to pre-warm evolution cache for Pokemon ${id}:`,
        error
      );
    }
  }

  logger.info(
    `Evolution cache pre-warming complete. Cache size: ${evolutionDataCache.size}`
  );
}

// Export utility functions for testing
export {
  checkForEvolution,
  getEvolutionData,
  getPokemonDisplayName,
  getPokemonSpriteUrl,
  isEgg,
  parseEvolutionChain
};

