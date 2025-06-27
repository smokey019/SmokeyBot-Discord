import { CommandInteraction } from "discord.js";
import { databaseClient } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { getRndInteger } from "../../utils";
import { queueMessage } from "../message_queue";

const logger = getLogger("Pokémon");

// Constants for configuration
const API_BASE_URL = "https://pokeapi.co/api/v2";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const API_TIMEOUT = 10000; // 10 seconds
const MAX_POKEMON_ID = 1025; // Current max Pokemon ID
const MIN_POKEMON_ID = 1;

// Pokemon interface from PokeAPI
interface Pokemon {
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

// Pokemon Species interface for additional data
interface PokemonSpecies {
  id: number;
  name: string;
  order: number;
  gender_rate: number;
  capture_rate: number;
  base_happiness: number;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  hatch_counter: number;
  has_gender_differences: boolean;
  forms_switchable: boolean;
  growth_rate: {
    name: string;
    url: string;
  };
  pokedex_numbers: Array<{
    entry_number: number;
    pokedex: {
      name: string;
      url: string;
    };
  }>;
  egg_groups: Array<{
    name: string;
    url: string;
  }>;
  color: {
    name: string;
    url: string;
  };
  shape: {
    name: string;
    url: string;
  };
  evolves_from_species: {
    name: string;
    url: string;
  } | null;
  evolution_chain: {
    url: string;
  };
  habitat: {
    name: string;
    url: string;
  } | null;
  generation: {
    name: string;
    url: string;
  };
  names: Array<{
    name: string;
    language: {
      name: string;
      url: string;
    };
  }>;
  flavor_text_entries: Array<{
    flavor_text: string;
    language: {
      name: string;
      url: string;
    };
    version: {
      name: string;
      url: string;
    };
  }>;
  form_descriptions: Array<{
    description: string;
    language: {
      name: string;
      url: string;
    };
  }>;
  genera: Array<{
    genus: string;
    language: {
      name: string;
      url: string;
    };
  }>;
  varieties: Array<{
    is_default: boolean;
    pokemon: {
      name: string;
      url: string;
    };
  }>;
}

// Evolution chain interface
interface EvolutionChain {
  id: number;
  baby_trigger_item: {
    name: string;
    url: string;
  } | null;
  chain: {
    is_baby: boolean;
    species: {
      name: string;
      url: string;
    };
    evolution_details: Array<{
      item: {
        name: string;
        url: string;
      } | null;
      trigger: {
        name: string;
        url: string;
      };
      gender: number | null;
      held_item: {
        name: string;
        url: string;
      } | null;
      known_move: {
        name: string;
        url: string;
      } | null;
      known_move_type: {
        name: string;
        url: string;
      } | null;
      location: {
        name: string;
        url: string;
      } | null;
      min_level: number | null;
      min_happiness: number | null;
      min_beauty: number | null;
      min_affection: number | null;
      needs_overworld_rain: boolean;
      party_species: {
        name: string;
        url: string;
      } | null;
      party_type: {
        name: string;
        url: string;
      } | null;
      relative_physical_stats: number | null;
      time_of_day: string;
      trade_species: {
        name: string;
        url: string;
      } | null;
      turn_upside_down: boolean;
    }>;
    evolves_to: any[]; // Recursive structure
  };
}

// Error handling
class PokemonError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "PokemonError";
  }
}

// Cache for API responses
const apiCache = new Map<string, { data: any; timestamp: number }>();

/**
 * Check if cached data is still valid
 * @param key - Cache key
 * @returns Cached data or null if expired/not found
 */
function getCachedData(key: string): any | null {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Remove expired cache entry
  if (cached) {
    apiCache.delete(key);
  }

  return null;
}

/**
 * Set data in cache
 * @param key - Cache key
 * @param data - Data to cache
 */
function setCachedData(key: string, data: any): void {
  apiCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Make API request with caching and error handling
 * @param url - API endpoint URL
 * @param cacheKey - Cache key for the request
 * @returns Promise resolving to API response data
 */
async function makeApiRequest(url: string, cacheKey: string): Promise<any> {
  // Check cache first
  const cached = getCachedData(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Create request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new PokemonError(
        `API request failed: ${response.status} ${response.statusText}`,
        "API_ERROR"
      );
    }

    const data = await response.json();

    // Cache successful response
    setCachedData(cacheKey, data);

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new PokemonError("API request timed out", "TIMEOUT_ERROR");
    }

    logger.error(`API request failed for ${url}:`, error);
    throw error;
  }
}

/**
 * Validate Pokemon ID
 * @param id - Pokemon ID to validate
 * @returns boolean indicating if ID is valid
 */
function isValidPokemonId(id: number): boolean {
  return typeof id === "number" && id >= MIN_POKEMON_ID && id <= MAX_POKEMON_ID;
}

/**
 * Normalize Pokemon name for API requests
 * @param name - Pokemon name
 * @returns Normalized name
 */
function normalizePokemonName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[♂♀]/g, "") // Remove gender symbols
    .replace(/[^a-z0-9-]/g, "-") // Replace special chars with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Get Pokemon name from API response (handles different formats)
 * @param pokemon - Pokemon API response
 * @returns Capitalized Pokemon name
 */
function getPokemonDisplayName(pokemon: Pokemon): string {
  if (!pokemon.name) return "Unknown";

  return pokemon.name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Check if Pokemon has valid sprite images
 * @param pokemon - Pokemon API response
 * @returns boolean indicating if Pokemon has usable images
 */
function hasValidSprites(pokemon: Pokemon): boolean {
  if (!pokemon.sprites) return false;

  // Check for official artwork (preferred)
  if (pokemon.sprites.other?.["official-artwork"]?.front_default) return true;

  // Check for showdown sprites
  if (pokemon.sprites.other?.showdown?.front_default) return true;

  // Check for basic sprites
  if (pokemon.sprites.front_default) return true;

  return false;
}

/**
 * Get random Pokemon ID for spawning
 * @returns Random Pokemon ID
 */
export function getRandomMonster(): number {
  return getRndInteger(MIN_POKEMON_ID, MAX_POKEMON_ID);
}

/**
 * Get Pokemon data from PokeAPI by ID
 * @param id - Pokemon ID
 * @returns Promise resolving to Pokemon data
 */
export async function findMonsterByID(id: number): Promise<Pokemon | null> {
  if (!isValidPokemonId(id)) {
    logger.warn(`Invalid Pokemon ID provided: ${id}`);
    return null;
  }

  try {
    const cacheKey = `pokemon-${id}`;
    const pokemon = await makeApiRequest(
      `${API_BASE_URL}/pokemon/${id}`,
      cacheKey
    );
    return pokemon as Pokemon;
  } catch (error) {
    logger.error(`Error fetching Pokemon with ID ${id}:`, error);
    return null;
  }
}

/**
 * Get Pokemon data from PokeAPI by name
 * @param name - Pokemon name
 * @returns Promise resolving to Pokemon data
 */
export async function findMonsterByName(name: string): Promise<Pokemon | null> {
  if (!name || typeof name !== "string") {
    logger.warn("Invalid Pokemon name provided");
    return null;
  }

  try {
    const normalizedName = normalizePokemonName(name);
    const cacheKey = `pokemon-name-${normalizedName}`;
    const pokemon = await makeApiRequest(
      `${API_BASE_URL}/pokemon/${normalizedName}`,
      cacheKey
    );
    return pokemon as Pokemon;
  } catch (error) {
    logger.error(`Error fetching Pokemon with name "${name}":`, error);
    return null;
  }
}

/**
 * Get Pokemon species data from PokeAPI
 * @param id - Pokemon species ID
 * @returns Promise resolving to species data
 */
export async function getPokemonSpecies(
  id: number
): Promise<PokemonSpecies | null> {
  if (!isValidPokemonId(id)) {
    logger.warn(`Invalid Pokemon species ID provided: ${id}`);
    return null;
  }

  try {
    const cacheKey = `species-${id}`;
    const species = await makeApiRequest(
      `${API_BASE_URL}/pokemon-species/${id}`,
      cacheKey
    );
    return species as PokemonSpecies;
  } catch (error) {
    logger.error(`Error fetching Pokemon species with ID ${id}:`, error);
    return null;
  }
}

/**
 * Get Pokemon evolution chain from PokeAPI
 * @param id - Evolution chain ID
 * @returns Promise resolving to evolution chain data
 */
export async function getPokemonEvolutions(
  id: number
): Promise<EvolutionChain | null> {
  if (typeof id !== "number" || id <= 0) {
    logger.warn(`Invalid evolution chain ID provided: ${id}`);
    return null;
  }

  try {
    const cacheKey = `evolution-${id}`;
    const evolution = await makeApiRequest(
      `${API_BASE_URL}/evolution-chain/${id}`,
      cacheKey
    );
    return evolution as EvolutionChain;
  } catch (error) {
    logger.error(`Error fetching evolution chain with ID ${id}:`, error);
    return null;
  }
}

/**
 * Get Pokemon with English name from species data
 * @param pokemon - Pokemon API response
 * @returns Promise resolving to Pokemon with English name
 */
export async function getPokemonWithEnglishName(
  pokemon: Pokemon
): Promise<Pokemon & { englishName?: string }> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    if (species) {
      const englishName = species.names.find(
        (n) => n.language.name === "en"
      )?.name;
      return {
        ...pokemon,
        englishName: englishName || getPokemonDisplayName(pokemon),
      };
    }
    return { ...pokemon, englishName: getPokemonDisplayName(pokemon) };
  } catch (error) {
    logger.error(
      `Error getting English name for Pokemon ${pokemon.id}:`,
      error
    );
    return { ...pokemon, englishName: getPokemonDisplayName(pokemon) };
  }
}

/**
 * Check if Pokemon is legendary or mythical
 * @param pokemon - Pokemon API response
 * @returns Promise resolving to boolean
 */
export async function isPokemonLegendary(pokemon: Pokemon): Promise<boolean> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    return species ? species.is_legendary || species.is_mythical : false;
  } catch (error) {
    logger.error(
      `Error checking legendary status for Pokemon ${pokemon.id}:`,
      error
    );
    return false;
  }
}

/**
 * Get all available Pokemon (for backwards compatibility)
 * @returns Array of Pokemon IDs
 */
export function getAllMonsters(): number[] {
  const allIds: number[] = [];
  for (let i = MIN_POKEMON_ID; i <= MAX_POKEMON_ID; i++) {
    allIds.push(i);
  }
  return allIds;
}

/**
 * Return total monster count for stats
 * @returns Promise resolving to total monster count
 */
export async function getMonsterDBCount(): Promise<string> {
  try {
    const result = await databaseClient<IMonsterModel>(MonsterTable)
      .count("id as count")
      .first();
    return result?.toString() || "0";
  } catch (error) {
    logger.error("Error getting monster DB count:", error);
    throw new PokemonError("Failed to get monster count", "DB_ERROR");
  }
}

/**
 * Return total shiny monster count for stats
 * @returns Promise resolving to shiny monster count
 */
export async function getShinyMonsterDBCount(): Promise<string> {
  try {
    const result = await databaseClient<IMonsterModel>(MonsterTable)
      .count("id as count")
      .where("shiny", 1)
      .first();
    return result?.toString() || "0";
  } catch (error) {
    logger.error("Error getting shiny monster DB count:", error);
    throw new PokemonError("Failed to get shiny monster count", "DB_ERROR");
  }
}

/**
 * Return user's monster database info
 * @param monster_id - Database ID
 * @returns Promise resolving to monster data or null
 */
export async function getUserMonster(
  monster_id: string | number
): Promise<IMonsterModel | null> {
  if (!monster_id) {
    logger.warn("No monster ID provided to getUserMonster");
    return null;
  }

  try {
    const monster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", monster_id)
      .first();

    return monster || null;
  } catch (error) {
    logger.error(`Error getting user monster ${monster_id}:`, error);
    throw new PokemonError("Failed to get user monster", "DB_ERROR");
  }
}

/**
 * Get a user's monsters
 * @param uid - Discord ID
 * @param released - 0 | 1, default 0
 * @returns Promise resolving to array of monster models
 */
export async function getUsersMonsters(
  uid: string,
  released: 0 | 1 = 0
): Promise<IMonsterModel[]> {
  if (!uid || typeof uid !== "string") {
    logger.warn("Invalid UID provided to getUsersMonsters");
    return [];
  }

  try {
    const monsters = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where({
        uid: uid,
        released: released,
      });
    return monsters || [];
  } catch (error) {
    logger.error(`Error getting user monsters for ${uid}:`, error);
    throw new PokemonError("Failed to get user monsters", "DB_ERROR");
  }
}

/**
 * Get a user's favorite monsters
 * @param uid - Discord ID
 * @param released - 0 | 1, default 0
 * @returns Promise resolving to array of favorite monster models
 */
export async function getUsersFavoriteMonsters(
  uid: string,
  released: 0 | 1 = 0
): Promise<IMonsterModel[]> {
  if (!uid || typeof uid !== "string") {
    logger.warn("Invalid UID provided to getUsersFavoriteMonsters");
    return [];
  }

  try {
    const monsters = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where({
        uid: uid,
        released: released,
        favorite: 1,
      });
    return monsters || [];
  } catch (error) {
    logger.error(`Error getting user favorite monsters for ${uid}:`, error);
    throw new PokemonError("Failed to get user favorite monsters", "DB_ERROR");
  }
}

/**
 * Select a monster for a user
 * @param interaction - Discord command interaction
 * @returns Promise resolving to success boolean
 */
export async function selectMonster(
  interaction: CommandInteraction
): Promise<boolean> {
  if (!interaction?.options?.get("pokemon")) {
    logger.warn("No pokemon option provided in selectMonster");
    return false;
  }

  try {
    const pokemonId = interaction.options.get("pokemon")!.value!.toString();

    const monster = await getUserMonster(pokemonId);
    if (!monster) {
      await queueMessage(
        "Monster not found or you don't own this Pokémon.",
        interaction,
        true
      );
      return false;
    }

    if (monster.uid !== interaction.user.id) {
      await queueMessage(
        "You can only select your own Pokémon.",
        interaction,
        true
      );
      return false;
    }

    // Get Pokemon data from API
    const pokemon = await findMonsterByID(monster.monster_id);
    if (!pokemon) {
      await queueMessage("Error retrieving Pokémon data.", interaction, true);
      return false;
    }

    const pokemonWithName = await getPokemonWithEnglishName(pokemon);
    const displayName =
      pokemonWithName.englishName || getPokemonDisplayName(pokemon);

    const updateResult = await databaseClient<IMonsterUserModel>(
      MonsterUserTable
    )
      .where({ uid: interaction.user.id })
      .update({ current_monster: parseInt(pokemonId) });

    if (updateResult) {
      await queueMessage(
        `Selected **Level ${monster.level} ${displayName}**!`,
        interaction,
        true
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.error("Error in selectMonster:", error);
    await queueMessage(
      "An error occurred while selecting your Pokémon.",
      interaction,
      true
    );
    return false;
  }
}

/**
 * Set a monster as favorite
 * @param interaction - Discord command interaction
 * @returns Promise resolving to success boolean
 */
export async function setFavorite(
  interaction: CommandInteraction
): Promise<boolean> {
  if (!interaction?.options?.get("pokemon")) {
    logger.warn("No pokemon option provided in setFavorite");
    return false;
  }

  try {
    const pokemonId = interaction.options.get("pokemon")!.value!.toString();

    const monster = await getUserMonster(pokemonId);
    if (!monster) {
      await queueMessage(
        "Monster not found or you don't own this Pokémon.",
        interaction,
        true
      );
      return false;
    }

    if (monster.uid !== interaction.user.id) {
      await queueMessage(
        "You can only favorite your own Pokémon.",
        interaction,
        true
      );
      return false;
    }

    // Get Pokemon data from API
    const pokemon = await findMonsterByID(monster.monster_id);
    if (!pokemon) {
      await queueMessage("Error retrieving Pokémon data.", interaction, true);
      return false;
    }

    const pokemonWithName = await getPokemonWithEnglishName(pokemon);
    const displayName =
      pokemonWithName.englishName || getPokemonDisplayName(pokemon);

    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where("id", monster.id)
      .update({ favorite: 1 });

    if (updateResult) {
      await queueMessage(
        `Favorited **Level ${monster.level} ${displayName}**! ⭐`,
        interaction,
        true
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.error("Error in setFavorite:", error);
    await queueMessage(
      "An error occurred while favoriting your Pokémon.",
      interaction,
      true
    );
    return false;
  }
}

/**
 * Remove favorite status from a monster
 * @param interaction - Discord command interaction
 * @returns Promise resolving to success boolean
 */
export async function unFavorite(
  interaction: CommandInteraction
): Promise<boolean> {
  if (!interaction?.options?.get("pokemon")) {
    logger.warn("No pokemon option provided in unFavorite");
    return false;
  }

  try {
    const pokemonId = interaction.options.get("pokemon")!.value!.toString();

    const monster = await getUserMonster(pokemonId);
    if (!monster) {
      await queueMessage(
        "Monster not found or you don't own this Pokémon.",
        interaction,
        true
      );
      return false;
    }

    if (monster.uid !== interaction.user.id) {
      await queueMessage(
        "You can only unfavorite your own Pokémon.",
        interaction,
        true
      );
      return false;
    }

    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where("id", monster.id)
      .update({ favorite: 0 });

    if (updateResult) {
      await queueMessage(
        `Unfavorited Pokémon ID ${monster.id}!`,
        interaction,
        true
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.error("Error in unFavorite:", error);
    await queueMessage(
      "An error occurred while unfavoriting your Pokémon.",
      interaction,
      true
    );
    return false;
  }
}

/**
 * Search for Pokemon by partial name match
 * @param partialName - Partial Pokemon name
 * @param limit - Maximum number of results (default 10)
 * @returns Promise resolving to array of matching Pokemon
 */
export async function searchPokemonByName(
  partialName: string,
  limit = 10
): Promise<Pokemon[]> {
  if (!partialName || typeof partialName !== "string") {
    return [];
  }

  const results: Pokemon[] = [];
  const searchTerm = partialName.toLowerCase().trim();

  // This is a simplified search - in a real implementation, you might want to
  // cache a list of all Pokemon names or use a more sophisticated search
  for (
    let i = MIN_POKEMON_ID;
    i <= Math.min(MIN_POKEMON_ID + 100, MAX_POKEMON_ID) &&
    results.length < limit;
    i++
  ) {
    try {
      const pokemon = await findMonsterByID(i);
      if (pokemon && pokemon.name.toLowerCase().includes(searchTerm)) {
        results.push(pokemon);
      }
    } catch (error) {
      // Continue searching even if one fails
      continue;
    }
  }

  return results;
}

/**
 * Get Pokemon type effectiveness information
 * @param typeId - Type ID or name
 * @returns Promise resolving to type data
 */
export async function getPokemonType(typeId: string | number): Promise<any> {
  try {
    const cacheKey = `type-${typeId}`;
    const typeData = await makeApiRequest(
      `${API_BASE_URL}/type/${typeId}`,
      cacheKey
    );
    return typeData;
  } catch (error) {
    logger.error(`Error fetching type data for ${typeId}:`, error);
    return null;
  }
}

/**
 * Get Pokemon move information
 * @param moveId - Move ID or name
 * @returns Promise resolving to move data
 */
export async function getPokemonMove(moveId: string | number): Promise<any> {
  try {
    const cacheKey = `move-${moveId}`;
    const moveData = await makeApiRequest(
      `${API_BASE_URL}/move/${moveId}`,
      cacheKey
    );
    return moveData;
  } catch (error) {
    logger.error(`Error fetching move data for ${moveId}:`, error);
    return null;
  }
}

/**
 * Get Pokemon ability information
 * @param abilityId - Ability ID or name
 * @returns Promise resolving to ability data
 */
export async function getPokemonAbility(
  abilityId: string | number
): Promise<any> {
  try {
    const cacheKey = `ability-${abilityId}`;
    const abilityData = await makeApiRequest(
      `${API_BASE_URL}/ability/${abilityId}`,
      cacheKey
    );
    return abilityData;
  } catch (error) {
    logger.error(`Error fetching ability data for ${abilityId}:`, error);
    return null;
  }
}

/**
 * Get Pokemon location areas where it can be encountered
 * @param pokemon - Pokemon API response
 * @returns Promise resolving to location area data
 */
export async function getPokemonLocationAreas(
  pokemon: Pokemon
): Promise<any[]> {
  try {
    if (!pokemon.location_area_encounters) return [];

    const cacheKey = `locations-${pokemon.id}`;
    const locationData = await makeApiRequest(
      pokemon.location_area_encounters,
      cacheKey
    );
    return locationData || [];
  } catch (error) {
    logger.error(
      `Error fetching location areas for Pokemon ${pokemon.id}:`,
      error
    );
    return [];
  }
}

/**
 * Generate a random Pokemon for spawning with validation
 * @returns Promise resolving to valid Pokemon data
 */
export async function getRandomValidPokemon(): Promise<Pokemon | null> {
  const maxAttempts = 10;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const randomId = getRandomMonster();
    const pokemon = await findMonsterByID(randomId);

    if (pokemon && hasValidSprites(pokemon)) {
      return pokemon;
    }

    attempts++;
  }

  logger.warn("Failed to find valid Pokemon after maximum attempts");
  return null;
}

/**
 * Clear API cache (useful for memory management)
 */
export function clearApiCache(): void {
  apiCache.clear();
  logger.info("API cache cleared");
}

/**
 * Get cache statistics
 * @returns Object containing cache statistics
 */
export function getCacheStats(): {
  size: number;
  keys: string[];
  memoryUsage: string;
} {
  const keys = Array.from(apiCache.keys());
  const memoryUsage = `${Math.round(
    JSON.stringify([...apiCache.values()]).length / 1024
  )} KB`;

  return {
    size: apiCache.size,
    keys,
    memoryUsage,
  };
}

/**
 * Check if Pokemon API is accessible
 * @returns Promise resolving to boolean indicating API availability
 */
export async function isPokeApiAvailable(): Promise<boolean> {
  try {
    await makeApiRequest(`${API_BASE_URL}/pokemon/1`, "health-check");
    return true;
  } catch (error) {
    logger.error("PokeAPI health check failed:", error);
    return false;
  }
}

/**
 * Get Pokemon generation information
 * @param generationId - Generation ID or name
 * @returns Promise resolving to generation data
 */
export async function getPokemonGeneration(
  generationId: string | number
): Promise<any> {
  try {
    const cacheKey = `generation-${generationId}`;
    const generationData = await makeApiRequest(
      `${API_BASE_URL}/generation/${generationId}`,
      cacheKey
    );
    return generationData;
  } catch (error) {
    logger.error(`Error fetching generation data for ${generationId}:`, error);
    return null;
  }
}

/**
 * Get Pokemon region information
 * @param regionId - Region ID or name
 * @returns Promise resolving to region data
 */
export async function getPokemonRegion(
  regionId: string | number
): Promise<any> {
  try {
    const cacheKey = `region-${regionId}`;
    const regionData = await makeApiRequest(
      `${API_BASE_URL}/region/${regionId}`,
      cacheKey
    );
    return regionData;
  } catch (error) {
    logger.error(`Error fetching region data for ${regionId}:`, error);
    return null;
  }
}

/**
 * Clean up expired cache entries
 */
export function cleanupExpiredCache(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of apiCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      apiCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} expired cache entries`);
  }
}

/**
 * Set up periodic cache cleanup (call this once during app initialization)
 */
export function setupCacheCleanup(): void {
  // Clean up cache every 5 minutes
  setInterval(cleanupExpiredCache, 5 * 60 * 1000);
}

// Export types for use in other modules
export type { EvolutionChain, Pokemon, PokemonError, PokemonSpecies };

