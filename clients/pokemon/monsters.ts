import { CommandInteraction, EmbedBuilder } from "discord.js";
import { databaseClient } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { getRndInteger } from "../../utils";
import { queueMessage } from "../message_queue";
import { getRandomNature } from "./natures";
import { capitalizeFirstLetter, rollGender } from "./utils";

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
export function getPokemonDisplayName(pokemon: Pokemon): string {
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
 * Format Pokemon types for display
 * @param types - Pokemon types from API
 * @returns Array of formatted type names
 */
export function formatPokemonTypes(types: Pokemon["types"]): string[] {
  if (!Array.isArray(types)) {
    return [];
  }

  return types
    .sort((a, b) => a.slot - b.slot) // Ensure correct order
    .map((typeData) => capitalizeFirstLetter(typeData.type.name))
    .filter(Boolean);
}

/**
 * Get appropriate Pokemon sprites based on shiny status
 * @param pokemon - Pokemon API response
 * @param isShiny - Whether to get shiny sprites
 * @returns Object with sprite URLs
 */
export function getPokemonSprites(
  pokemon: Pokemon,
  isShiny: boolean = false
): {
  artwork?: string;
  showdown?: string;
  default?: string;
} {
  const sprites = {
    artwork: undefined as string | undefined,
    showdown: undefined as string | undefined,
    default: undefined as string | undefined,
  };

  // Early validation
  if (!pokemon || !pokemon.sprites) {
    logger.warn(`Invalid pokemon data provided to getPokemonSprites: ${pokemon?.id || 'undefined'}`);
    return sprites;
  }

  try {
    if (isShiny) {
      sprites.artwork =
        pokemon.sprites?.other?.["official-artwork"]?.front_shiny || undefined;
      sprites.showdown =
        pokemon.sprites?.other?.showdown?.front_shiny || undefined;
      sprites.default = pokemon.sprites?.front_shiny || undefined;
    } else {
      sprites.artwork =
        pokemon.sprites?.other?.["official-artwork"]?.front_default ||
        undefined;
      sprites.showdown =
        pokemon.sprites?.other?.showdown?.front_default || undefined;
      sprites.default = pokemon.sprites?.front_default || undefined;
    }

    // Fallback logic
    if (!sprites.artwork) {
      sprites.artwork = sprites.default;
    }
    if (!sprites.showdown) {
      sprites.showdown = sprites.artwork;
    }
  } catch (error) {
    logger.error("Error getting Pokemon sprites:", error);
  }

  return sprites;
}

/**
 * Extract base stats from Pokemon API response
 * @param pokemon - Pokemon API response
 * @returns Object with base stats
 */
export function getPokemonBaseStats(pokemon: Pokemon): {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
  total: number;
} {
  const stats = {
    hp: 0,
    attack: 0,
    defense: 0,
    sp_attack: 0,
    sp_defense: 0,
    speed: 0,
    total: 0,
  };

  // Validate pokemon object and stats array
  if (!pokemon || !pokemon.stats || !Array.isArray(pokemon.stats)) {
    logger.warn(`Invalid pokemon data provided to getPokemonBaseStats: ${pokemon?.id || 'undefined'}`);
    return stats;
  }

  const statMapping: Record<string, keyof typeof stats> = {
    hp: "hp",
    attack: "attack",
    defense: "defense",
    "special-attack": "sp_attack",
    "special-defense": "sp_defense",
    speed: "speed",
  };

  for (const apiStat of pokemon.stats) {
    if (!apiStat || !apiStat.stat || typeof apiStat.base_stat !== 'number') {
      continue; // Skip invalid stat entries
    }

    const statName = statMapping[apiStat.stat.name];
    if (statName && statName !== "total") {
      stats[statName] = apiStat.base_stat;
      stats.total += apiStat.base_stat;
    }
  }

  return stats;
}

/**
 * Get comprehensive evolution information for a Pokemon
 * @param pokemonId - Pokemon ID
 * @returns Evolution information including pre-evolutions and evolutions
 */
export async function getPokemonEvolutionInfo(pokemonId: number): Promise<{
  preEvolutions: string[];
  evolutions: string[];
  evolutionItems: string[];
  evolutionMethods: string[];
}> {
  try {
    const species = await getPokemonSpecies(pokemonId);
    if (!species) {
      return {
        preEvolutions: [],
        evolutions: [],
        evolutionItems: [],
        evolutionMethods: [],
      };
    }

    // Extract evolution chain ID from URL
    const chainId = parseInt(
      species.evolution_chain.url.split("/").slice(-2, -1)[0]
    );
    const evolutionChain = await getPokemonEvolutions(chainId);

    if (!evolutionChain) {
      return {
        preEvolutions: [],
        evolutions: [],
        evolutionItems: [],
        evolutionMethods: [],
      };
    }

    const preEvolutions: string[] = [];
    const evolutions: string[] = [];
    const evolutionItems: string[] = [];
    const evolutionMethods: string[] = [];

    // Helper function to extract evolution names recursively
    function extractEvolutions(chain: any, currentSpeciesName: string): void {
      if (chain.species.name === currentSpeciesName) {
        // Found current Pokemon, get evolutions
        if (chain.evolves_to && chain.evolves_to.length > 0) {
          chain.evolves_to.forEach((evolution: any) => {
            evolutions.push(
              getPokemonDisplayName({ name: evolution.species.name } as Pokemon)
            );

            // Check for evolution details
            if (
              evolution.evolution_details &&
              evolution.evolution_details.length > 0
            ) {
              evolution.evolution_details.forEach((detail: any) => {
                if (detail.item && detail.item.name) {
                  evolutionItems.push(
                    getPokemonDisplayName({ name: detail.item.name } as Pokemon)
                  );
                }
                if (detail.trigger && detail.trigger.name) {
                  const method = detail.trigger.name;
                  if (detail.min_level) {
                    evolutionMethods.push(`Level ${detail.min_level}`);
                  } else if (method === "trade") {
                    evolutionMethods.push("Trade");
                  } else if (method === "use-item") {
                    evolutionMethods.push("Stone");
                  } else {
                    evolutionMethods.push(
                      getPokemonDisplayName({ name: method } as Pokemon)
                    );
                  }
                }
              });
            }
          });
        }
        return;
      }

      // Check if current Pokemon is an evolution
      if (chain.evolves_to && chain.evolves_to.length > 0) {
        chain.evolves_to.forEach((evolution: any) => {
          if (evolution.species.name === currentSpeciesName) {
            preEvolutions.push(
              getPokemonDisplayName({ name: chain.species.name } as Pokemon)
            );
          } else {
            extractEvolutions(evolution, currentSpeciesName);
          }
        });
      }
    }

    // Get current Pokemon name from species
    const currentPokemonName = species.name;
    extractEvolutions(evolutionChain.chain, currentPokemonName);

    return { preEvolutions, evolutions, evolutionItems, evolutionMethods };
  } catch (error) {
    logger.error(
      `Error getting evolution info for Pokemon ${pokemonId}:`,
      error
    );
    return {
      preEvolutions: [],
      evolutions: [],
      evolutionItems: [],
      evolutionMethods: [],
    };
  }
}

/**
 * Get Pokemon habitat information
 * @param pokemon - Pokemon API response
 * @returns Habitat name or null
 */
export async function getPokemonHabitat(
  pokemon: Pokemon
): Promise<string | null> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    return species?.habitat?.name
      ? getPokemonDisplayName({ name: species.habitat.name } as Pokemon)
      : null;
  } catch (error) {
    logger.error(`Error getting habitat for Pokemon ${pokemon.id}:`, error);
    return null;
  }
}

/**
 * Get Pokemon generation name
 * @param pokemon - Pokemon API response
 * @returns Generation name
 */
export async function getPokemonGenerationName(
  pokemon: Pokemon
): Promise<string> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    if (species?.generation?.name) {
      return species.generation.name
        .replace("generation-", "Generation ")
        .toUpperCase();
    }
    return "Unknown";
  } catch (error) {
    logger.error(`Error getting generation for Pokemon ${pokemon.id}:`, error);
    return "Unknown";
  }
}

/**
 * Get Pokemon description/flavor text
 * @param pokemon - Pokemon API response
 * @param language - Language code (default: 'en')
 * @returns Flavor text description
 */
export async function getPokemonDescription(
  pokemon: Pokemon,
  language: string = "en"
): Promise<string> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    if (!species) return "No description available.";

    const flavorText = species.flavor_text_entries.find(
      (entry) => entry.language.name === language
    );

    if (flavorText) {
      return flavorText.flavor_text.replace(/\f/g, " ").replace(/\n/g, " ");
    }

    return "No description available.";
  } catch (error) {
    logger.error(`Error getting description for Pokemon ${pokemon.id}:`, error);
    return "No description available.";
  }
}

/**
 * Get Pokemon egg groups
 * @param pokemon - Pokemon API response
 * @returns Array of egg group names
 */
export async function getPokemonEggGroups(pokemon: Pokemon): Promise<string[]> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    if (!species) return [];

    return species.egg_groups.map((group) =>
      getPokemonDisplayName({ name: group.name } as Pokemon)
    );
  } catch (error) {
    logger.error(`Error getting egg groups for Pokemon ${pokemon.id}:`, error);
    return [];
  }
}

/**
 * Get Pokemon abilities with descriptions
 * @param pokemon - Pokemon API response
 * @returns Array of ability information
 */
export async function getPokemonAbilities(pokemon: Pokemon): Promise<
  Array<{
    name: string;
    isHidden: boolean;
    slot: number;
    description?: string;
  }>
> {
  const abilities = [];

  for (const ability of pokemon.abilities) {
    try {
      const abilityData = await getPokemonAbility(ability.ability.name);
      const description =
        abilityData?.effect_entries?.find(
          (entry: any) => entry.language.name === "en"
        )?.effect || "No description available.";

      abilities.push({
        name: getPokemonDisplayName({ name: ability.ability.name } as Pokemon),
        isHidden: ability.is_hidden,
        slot: ability.slot,
        description,
      });
    } catch (error) {
      logger.warn(
        `Error getting ability data for ${ability.ability.name}:`,
        error
      );
      abilities.push({
        name: getPokemonDisplayName({ name: ability.ability.name } as Pokemon),
        isHidden: ability.is_hidden,
        slot: ability.slot,
      });
    }
  }

  return abilities.sort((a, b) => a.slot - b.slot);
}

/**
 * Check if Pokemon has gender differences
 * @param pokemon - Pokemon API response
 * @returns Boolean indicating if Pokemon has gender differences
 */
export function hasGenderDifferences(pokemon: Pokemon): boolean {
  return Boolean(pokemon.sprites?.front_female || pokemon.sprites?.back_female);
}

/**
 * Get Pokemon weight in different units
 * @param pokemon - Pokemon API response
 * @returns Weight in hectograms and pounds
 */
export function getPokemonWeight(pokemon: Pokemon): {
  hectograms: number;
  pounds: number;
} {
  const hectograms = pokemon.weight;
  const pounds = Math.round(hectograms * 0.220462 * 10) / 10;
  return { hectograms, pounds };
}

/**
 * Get Pokemon height in different units
 * @param pokemon - Pokemon API response
 * @returns Height in decimeters and feet/inches
 */
export function getPokemonHeight(pokemon: Pokemon): {
  decimeters: number;
  feet: number;
  inches: number;
  totalInches: number;
} {
  const decimeters = pokemon.height;
  const totalInches = Math.round(decimeters * 3.93701);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;

  return { decimeters, feet, inches, totalInches };
}

/**
 * Get Pokemon rarity category based on various factors
 * @param pokemon - Pokemon API response
 * @returns Rarity category
 */
export async function getPokemonRarity(pokemon: Pokemon): Promise<{
  category:
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Very Rare"
  | "Legendary"
  | "Mythical";
  factors: string[];
}> {
  const factors: string[] = [];
getPokemonRarityEmoji
  // Early validation
  if (!pokemon || !pokemon.id) {
    logger.warn(`Invalid pokemon data provided to getPokemonRarity: ${pokemon?.id || 'undefined'}`);
    return { category: "Common", factors: ["Invalid pokemon data"] };
  }

  try {
    const [species, isLegendary] = await Promise.all([
      getPokemonSpecies(pokemon.id),
      isPokemonLegendary(pokemon),
    ]);

    if (species?.is_mythical) {
      factors.push("Mythical Pokemon");
      return { category: "Mythical", factors };
    }

    if (species?.is_legendary || isLegendary) {
      factors.push("Legendary Pokemon");
      return { category: "Legendary", factors };
    }

    // Base stat total calculation with validation
    const baseStats = getPokemonBaseStats(pokemon);
    if (baseStats.total >= 600) {
      factors.push("High base stat total (600+)");
      return { category: "Very Rare", factors };
    }

    if (baseStats.total >= 500) {
      factors.push("Above average base stat total (500+)");
      return { category: "Rare", factors };
    }

    if (baseStats.total >= 400) {
      factors.push("Average base stat total");
      return { category: "Uncommon", factors };
    }

    factors.push("Below average base stat total");
    return { category: "Common", factors };
  } catch (error) {
    logger.error(`Error determining rarity for Pokemon ${pokemon.id}:`, error);
    return { category: "Common", factors: ["Error determining rarity"] };
  }
}

/**
 * Format Pokemon ID with appropriate padding
 * @param id - Pokemon ID
 * @param padding - Number of digits to pad to (default: 3)
 * @returns Padded ID string
 */
export function formatPokemonId(id: number, padding: number = 3): string {
  return id.toString().padStart(padding, "0");
}

/**
 * Get Pokemon color from species data
 * @param pokemon - Pokemon API response
 * @returns Color name
 */
export async function getPokemonColor(pokemon: Pokemon): Promise<string> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    return species?.color?.name
      ? getPokemonDisplayName({ name: species.color.name } as Pokemon)
      : "Unknown";
  } catch (error) {
    logger.error(`Error getting color for Pokemon ${pokemon.id}:`, error);
    return "Unknown";
  }
}

/**
 * Calculate Pokemon catch rate percentage
 * @param pokemon - Pokemon API response
 * @returns Catch rate as percentage
 */
export async function getPokemonCatchRate(pokemon: Pokemon): Promise<number> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    if (!species) return 0;

    // Catch rate formula: (catch_rate / 255) * 100
    return Math.round((species.capture_rate / 255) * 100);
  } catch (error) {
    logger.error(`Error getting catch rate for Pokemon ${pokemon.id}:`, error);
    return 0;
  }
}

/**
 * Check if Pokemon is a baby Pokemon
 * @param pokemon - Pokemon API response
 * @returns Boolean indicating if Pokemon is a baby
 */
export async function isPokemonBaby(pokemon: Pokemon): Promise<boolean> {
  try {
    const species = await getPokemonSpecies(pokemon.id);
    return species?.is_baby || false;
  } catch (error) {
    logger.error(
      `Error checking baby status for Pokemon ${pokemon.id}:`,
      error
    );
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS FOR COMMON OPERATIONS
// ============================================================================

/**
 * Create a comprehensive Pokemon info object
 * @param pokemon - Pokemon API response
 * @returns Complete Pokemon information
 */
export async function getComprehensivePokemonInfo(pokemon: Pokemon): Promise<{
  basic: {
    id: number;
    name: string;
    displayName: string;
    types: string[];
    height: ReturnType<typeof getPokemonHeight>;
    weight: ReturnType<typeof getPokemonWeight>;
  };
  stats: ReturnType<typeof getPokemonBaseStats>;
  sprites: ReturnType<typeof getPokemonSprites>;
  evolution: Awaited<ReturnType<typeof getPokemonEvolutionInfo>>;
  species: {
    isLegendary: boolean;
    isMythical: boolean;
    isBaby: boolean;
    generation: string;
    habitat: string | null;
    color: string;
    description: string;
    eggGroups: string[];
    catchRate: number;
  };
  abilities: Awaited<ReturnType<typeof getPokemonAbilities>>;
  rarity: Awaited<ReturnType<typeof getPokemonRarity>>;
}> {
  const [
    pokemonWithName,
    evolutionInfo,
    isLegendary,
    species,
    habitat,
    generation,
    color,
    description,
    eggGroups,
    abilities,
    rarity,
    catchRate,
    isBaby,
  ] = await Promise.all([
    getPokemonWithEnglishName(pokemon),
    getPokemonEvolutionInfo(pokemon.id),
    isPokemonLegendary(pokemon),
    getPokemonSpecies(pokemon.id),
    getPokemonHabitat(pokemon),
    getPokemonGenerationName(pokemon),
    getPokemonColor(pokemon),
    getPokemonDescription(pokemon),
    getPokemonEggGroups(pokemon),
    getPokemonAbilities(pokemon),
    getPokemonRarity(pokemon),
    getPokemonCatchRate(pokemon),
    isPokemonBaby(pokemon),
  ]);

  return {
    basic: {
      id: pokemon.id,
      name: pokemon.name,
      displayName:
        pokemonWithName.englishName || getPokemonDisplayName(pokemon),
      types: formatPokemonTypes(pokemon.types),
      height: getPokemonHeight(pokemon),
      weight: getPokemonWeight(pokemon),
    },
    stats: getPokemonBaseStats(pokemon),
    sprites: {
      normal: getPokemonSprites(pokemon, false),
      shiny: getPokemonSprites(pokemon, true),
    },
    evolution: evolutionInfo,
    species: {
      isLegendary,
      isMythical: species?.is_mythical || false,
      isBaby,
      generation,
      habitat,
      color,
      description,
      eggGroups,
      catchRate,
    },
    abilities,
    rarity,
  };
}

/**
 * Specialized Pokemon name normalization for catching mechanics
 * Handles special cases with hyphens and spaces differently than general normalization
 * @param pokemonName - Original Pokemon name
 * @returns Normalized Pokemon name for catching
 */
export function normalizePokemonNameForCatch(pokemonName: string): string {
  if (!pokemonName || typeof pokemonName !== "string") {
    return "";
  }

  // Special Pokemon names that should maintain hyphens
  const HYPHENATED_EXCEPTIONS = new Set([
    "chi-yu",
    "ting-lu",
    "chien-pao",
    "wo-chien",
    "ho-oh",
    "kommo-o",
    "hakamo-o",
    "type-null",
    "tapu-lele",
  ]);

  // Pokemon names that need space replacement instead of hyphen removal
  const SPACE_REPLACEMENT = new Set(["sandy-shocks", "mr-rime"]);

  const lowerName = pokemonName.toLowerCase().trim();

  // Handle space replacement cases
  if (SPACE_REPLACEMENT.has(lowerName)) {
    return lowerName.replace("-", " ");
  }

  // Handle hyphenated exceptions
  if (HYPHENATED_EXCEPTIONS.has(lowerName)) {
    return lowerName;
  }

  // Handle general hyphen cases - take first part only
  if (lowerName.includes("-")) {
    return lowerName.split("-")[0] || lowerName;
  }

  return lowerName;
}

/**
 * Calculate average IV percentage from individual IV values
 * @param ivStats - Object containing individual IV values
 * @returns Average IV as a percentage (0-100)
 */
export function calculateIVPercentage(ivStats: {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
}): number {
  const MAX_IV_TOTAL = 186; // 31 * 6 stats
  const totalIV =
    ivStats.hp +
    ivStats.attack +
    ivStats.defense +
    ivStats.sp_attack +
    ivStats.sp_defense +
    ivStats.speed;

  return parseFloat(((totalIV / MAX_IV_TOTAL) * 100).toFixed(2));
}

/**
 * Generate random IV stats for a Pokemon
 * @param isPerfect - Whether to generate high IV stats (28-31 range)
 * @returns Object containing IV values
 */
export function generatePokemonIVs(isPerfect: boolean = false): {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
} {
  const MAX_IV = 31;
  const PERFECT_IV_MIN = 28;
  const minIV = isPerfect ? PERFECT_IV_MIN : 1;

  return {
    hp: getRndInteger(minIV, MAX_IV),
    attack: getRndInteger(minIV, MAX_IV),
    defense: getRndInteger(minIV, MAX_IV),
    sp_attack: getRndInteger(minIV, MAX_IV),
    sp_defense: getRndInteger(minIV, MAX_IV),
    speed: getRndInteger(minIV, MAX_IV),
  };
}

/**
 * Validate spawn data structure
 * @param spawnData - Spawn data to validate
 * @returns Boolean indicating if spawn data is valid
 */
export function validateSpawnData(spawnData: any): boolean {
  return !!(
    spawnData?.monster?.name &&
    spawnData.monster.id &&
    typeof spawnData.monster.name === "string" &&
    typeof spawnData.monster.id === "number" &&
    spawnData.monster.id > 0
  );
}

/**
 * Check if user input matches Pokemon name (supports variants and regional forms)
 * @param userInput - User's guess
 * @param pokemonName - Pokemon name to match against
 * @returns Boolean indicating if names match
 */
export function doesInputMatchPokemonName(
  userInput: string,
  pokemonName: string
): boolean {
  if (!userInput || !pokemonName) {
    return false;
  }

  const normalizedInput = userInput.toLowerCase().trim();
  const normalizedPokemon = pokemonName.toLowerCase().trim();

  // Check exact match
  if (normalizedInput === normalizedPokemon) {
    return true;
  }

  // Check match with regional/gender markers removed
  const cleanedName = normalizedPokemon
    .replace(/(♂|♀| RS| SS|Galarian |Alolan |Hisuian )/gi, "")
    .toLowerCase()
    .trim();

  return normalizedInput === cleanedName;
}

/**
 * Calculate currency bonuses for Pokemon catching
 * @param config - Configuration for bonus calculation
 * @returns Object with bonus amounts and descriptions
 */
export function calculateCatchBonuses(config: {
  isShiny: boolean;
  isNewPokemon: boolean;
  isLegendary?: boolean;
  streak?: number;
  baseCatchReward?: number;
}): {
  totalBonus: number;
  bonuses: Array<{ type: string; amount: number; description: string }>;
} {
  const bonuses = [];
  let totalBonus = config.baseCatchReward || 10;

  // Base catch reward
  bonuses.push({
    type: "base",
    amount: config.baseCatchReward || 10,
    description: "Base catch reward",
  });

  // New Pokemon bonus
  if (config.isNewPokemon && !config.isShiny) {
    const newBonus = 100;
    bonuses.push({
      type: "new",
      amount: newBonus,
      description: "New Pokémon bonus",
    });
    totalBonus += newBonus;
  }

  // Shiny bonus
  if (config.isShiny) {
    const shinyBonus = 1000;
    bonuses.push({
      type: "shiny",
      amount: shinyBonus,
      description: "Shiny Pokémon bonus",
    });
    totalBonus += shinyBonus;
  }

  // Legendary bonus
  if (config.isLegendary) {
    const legendaryBonus = 500;
    bonuses.push({
      type: "legendary",
      amount: legendaryBonus,
      description: "Legendary Pokémon bonus",
    });
    totalBonus += legendaryBonus;
  }

  // Streak bonus
  if (config.streak && config.streak >= 10) {
    const streakBonus = 250;
    bonuses.push({
      type: "streak",
      amount: streakBonus,
      description: `${config.streak} catch streak bonus`,
    });
    totalBonus += streakBonus;
  }

  return { totalBonus, bonuses };
}

/**
 * Create a complete monster object for database insertion
 * @param config - Configuration for monster creation
 * @returns Complete monster object
 */
export function createPokemonMonsterObject(config: {
  pokemonId: number;
  userId: string;
  level?: number;
  isShiny?: boolean;
  gender?: string;
  nature?: string;
  ivs?: ReturnType<typeof generatePokemonIVs>;
  experience?: number;
  isEgg?: boolean;
}): IMonsterModel {
  const level = config.level || getRndInteger(1, 49);
  const ivStats = config.ivs || generatePokemonIVs();
  const averageIV = calculateIVPercentage(ivStats);

  return {
    monster_id: config.pokemonId,
    ...ivStats,
    nature: config.nature || getRandomNature(), // You'll need to import this
    experience: config.experience || level * 1250,
    level: level,
    uid: config.userId,
    original_uid: config.userId,
    shiny: config.isShiny ? 1 : 0,
    captured_at: Date.now(),
    gender: config.gender || rollGender(), // You'll need to import this
    egg: config.isEgg ? 1 : 0,
    avg_iv: averageIV,
  };
}

/**
 * Format catch response message based on conditions
 * @param config - Configuration for response generation
 * @returns Formatted response message
 */
export function generateCatchResponseMessage(config: {
  pokemonName: string;
  level: number;
  isShiny: boolean;
  isNewPokemon: boolean;
  isLegendary?: boolean;
  averageIV: number;
  pokemonId: number;
  databaseId: number;
  responses?: string[];
}): string {
  const responses = config.responses || [
    "YOINK",
    "YOINKERS",
    "NICE",
    "NOICE",
    "Congrats",
  ];
  const randomResponse = responses[getRndInteger(0, responses.length - 1)];
  const shinyEmoji = config.isShiny ? " ⭐" : "";
  const legendaryEmoji = config.isLegendary ? " 💠" : "";
  const pokemonName = getPokemonDisplayName({
    name: config.pokemonName,
  } as Pokemon);

  if (config.isShiny && config.isNewPokemon) {
    return `_**POGGERS**_! You caught a __***SHINY***__ level **${config.level
      } ${pokemonName}**${shinyEmoji + legendaryEmoji
      }! \n\n Avg IV: **${config.averageIV.toFixed(2)}**% \nPoké #${config.pokemonId
      } - ID: **${config.databaseId}** \n\n **NEW POKéMON!** Added to Pokédex.`;
  } else if (!config.isShiny && config.isNewPokemon) {
    return `**${randomResponse}**! You caught a level **${config.level
      } ${pokemonName}**${shinyEmoji + legendaryEmoji
      }! \n\n Avg IV: **${config.averageIV.toFixed(2)}**% - Poké #${config.pokemonId
      } - ID: **${config.databaseId}** - **NEW POKéMON!** Added to Pokédex.`;
  } else if (!config.isShiny && !config.isNewPokemon) {
    return `**${randomResponse}**! You caught a level **${config.level
      } ${pokemonName}**${shinyEmoji + legendaryEmoji
      }! Avg IV: **${config.averageIV.toFixed(2)}**% - ID: **${config.databaseId
      }**.`;
  } else if (config.isShiny && !config.isNewPokemon) {
    return `_**POGGERS**_! You caught a __***SHINY***__ level **${config.level
      } ${pokemonName}${shinyEmoji + legendaryEmoji
      }**! \n\n Avg IV: **${config.averageIV.toFixed(2)}**% \nID: **${config.databaseId
      }**.`;
  }

  return `Caught ${pokemonName}!`;
}

/**
 * Get Pokemon rarity emoji based on species data
 * @param pokemon - Pokemon API response
 * @returns Emoji string for rarity
 */
export async function getPokemonRarityEmoji(pokemon: Pokemon): Promise<string> {
  // Early validation
  if (!pokemon || !pokemon.id) {
    logger.warn(`Invalid pokemon data provided to getPokemonRarityEmoji: ${pokemon?.id || 'undefined'}`);
    return "";
  }

  try {
    const [isLegendary, species] = await Promise.all([
      isPokemonLegendary(pokemon),
      getPokemonSpecies(pokemon.id),
    ]);

    if (species?.is_mythical) return " 🌟";
    if (species?.is_legendary || isLegendary) return " 💠";

    // Check base stat total for rarity with validation
    const baseStats = getPokemonBaseStats(pokemon);
    if (baseStats.total >= 600) return " 💎";
    if (baseStats.total >= 500) return " 🔹";

    return "";
  } catch (error) {
    logger.error(
      `Error getting rarity emoji for Pokemon ${pokemon.id}:`,
      error
    );
    return "";
  }
}

/**
 * Validate Pokemon ID range
 * @param id - Pokemon ID to validate
 * @param minId - Minimum valid ID (default: 1)
 * @param maxId - Maximum valid ID (default: 1025)
 * @returns Boolean indicating if ID is valid
 */
export function isValidPokemonIdRange(
  id: number,
  minId: number = 1,
  maxId: number = 1025
): boolean {
  return (
    typeof id === "number" && id >= minId && id <= maxId && Number.isInteger(id)
  );
}

/**
 * Format Pokemon level with appropriate styling
 * @param level - Pokemon level
 * @param maxLevel - Maximum level (default: 100)
 * @returns Formatted level string
 */
export function formatPokemonLevel(
  level: number,
  maxLevel: number = 100
): string {
  if (level >= maxLevel) {
    return `**${level}** ⭐`;
  } else if (level >= 50) {
    return `**${level}**`;
  } else {
    return level.toString();
  }
}

/**
 * Get Pokemon type color for embeds
 * @param primaryType - Primary type name
 * @returns Hex color code
 */
export function getPokemonTypeColor(primaryType: string): number {
  const typeColors: Record<string, number> = {
    normal: 0xa8a878,
    fire: 0xf08030,
    water: 0x6890f0,
    electric: 0xf8d030,
    grass: 0x78c850,
    ice: 0x98d8d8,
    fighting: 0xc03028,
    poison: 0xa040a0,
    ground: 0xe0c068,
    flying: 0xa890f0,
    psychic: 0xf85888,
    bug: 0xa8b820,
    rock: 0xb8a038,
    ghost: 0x705898,
    dragon: 0x7038f8,
    dark: 0x705848,
    steel: 0xb8b8d0,
    fairy: 0xee99ac,
  };

  return typeColors[primaryType.toLowerCase()] || 0x68a0b0; // Default blue
}

/**
 * Convert experience to level using Pokemon formula
 * @param experience - Total experience points
 * @param growthRate - Growth rate type (default: 'medium-fast')
 * @returns Calculated level
 */
export function experienceToLevel(
  experience: number,
  growthRate: string = "medium-fast"
): number {
  // Simplified calculation for medium-fast growth rate
  // For more accurate calculation, you'd need the full growth rate formulas
  if (growthRate === "medium-fast") {
    return Math.floor(Math.cbrt(experience)) + 1;
  }

  // Fallback calculation
  return Math.max(1, Math.floor(experience / 1250));
}

/**
 * Convert level to required experience
 * @param level - Target level
 * @param growthRate - Growth rate type (default: 'medium-fast')
 * @returns Required experience points
 */
export function levelToExperience(
  level: number,
  growthRate: string = "medium-fast"
): number {
  // Simplified calculation for medium-fast growth rate
  if (growthRate === "medium-fast") {
    return Math.pow(level - 1, 3);
  }

  // Fallback calculation
  return level * 1250;
}

/**
 * Check if Pokemon is suitable for spawning (has required sprites)
 * @param pokemon - Pokemon API response
 * @returns Boolean indicating if Pokemon can be spawned
 */
export function isPokemonSpawnable(pokemon: Pokemon): boolean {
  if (!pokemon || !pokemon.name || !pokemon.id) {
    return false;
  }

  const sprites = getPokemonSprites(pokemon, false);

  // Must have at least one usable sprite
  return Boolean(sprites.artwork || sprites.showdown || sprites.default);
}

/**
 * Check if Pokemon type matches weather boost
 * @param pokemon - Pokemon API response
 * @param boostedTypes - Array of boosted type names
 * @returns Boolean indicating if Pokemon is weather boosted
 */
export function isPokemonWeatherBoosted(pokemon: Pokemon, boostedTypes: string[]): boolean {
  if (!pokemon || !pokemon.types || !Array.isArray(boostedTypes) || boostedTypes.length === 0) {
    return false;
  }

  const normalizedBoosts = boostedTypes.map(type => type.toLowerCase());

  return pokemon.types.some((typeObj) =>
    normalizedBoosts.includes(typeObj.type.name.toLowerCase())
  );
}

/**
 * Get random Pokemon with constraints and retry logic
 * @param constraints - Constraints for Pokemon selection
 * @returns Promise resolving to Pokemon or null
 */
export async function getRandomPokemonWithConstraints(constraints: {
  maxAttempts?: number;
  preferredTypes?: string[];
  requireSprites?: boolean;
  excludeIds?: number[];
  minId?: number;
  maxId?: number;
}): Promise<Pokemon | null> {
  const {
    maxAttempts = 10,
    preferredTypes = [],
    requireSprites = true,
    excludeIds = [],
    minId = 1,
    maxId = 1025
  } = constraints;

  let attempts = 0;
  let bestCandidate: Pokemon | null = null;
  let foundPreferred = false;

  while (attempts < maxAttempts && (!bestCandidate || (!foundPreferred && preferredTypes.length > 0))) {
    try {
      // Generate random ID within range
      const randomId = getRndInteger(minId, maxId);

      // Skip excluded IDs
      if (excludeIds.includes(randomId)) {
        attempts++;
        continue;
      }

      const candidate = await findMonsterByID(randomId);
      if (!candidate) {
        attempts++;
        continue;
      }

      // Check sprite requirement
      if (requireSprites && !isPokemonSpawnable(candidate)) {
        attempts++;
        continue;
      }

      // Check if this matches preferred types
      const isPreferred = preferredTypes.length === 0 ||
        isPokemonWeatherBoosted(candidate, preferredTypes);

      // Accept immediately if preferred, or after enough attempts
      if (isPreferred || attempts >= Math.floor(maxAttempts / 2)) {
        bestCandidate = candidate;
        foundPreferred = isPreferred;

        if (isPreferred || attempts >= maxAttempts - 1) {
          break;
        }
      }

      // Keep as backup if no preferred found yet
      if (!bestCandidate) {
        bestCandidate = candidate;
      }

      attempts++;
    } catch (error) {
      logger.error(`Error in getRandomPokemonWithConstraints attempt ${attempts}:`, error);
      attempts++;
    }
  }

  return bestCandidate;
}

/**
 * Generate wild encounter phrases with Pokemon name replacement
 * @param pokemonName - Name of the Pokemon
 * @param phrases - Array of phrase templates (optional)
 * @returns Random encounter phrase
 */
export function generateEncounterPhrase(pokemonName: string, phrases?: string[]): string {
  const defaultPhrases = [
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
  ];

  const phrasesToUse = phrases || defaultPhrases;
  const randomIndex = Math.floor(Math.random() * phrasesToUse.length);
  const phrase = phrasesToUse[randomIndex];
  const displayName = getPokemonDisplayName({ name: pokemonName } as Pokemon);

  return phrase.replace(/\{pokemon\}/g, displayName);
}

/**
 * Create spawn embed with proper type styling and fallbacks
 * @param pokemon - Pokemon to create embed for
 * @param options - Embed customization options
 * @returns EmbedBuilder ready for sending
 */
export function createPokemonSpawnEmbed(pokemon: Pokemon, options: {
  isForced?: boolean;
  customTitle?: string;
  customDescription?: string;
  showTypes?: boolean;
  showStats?: boolean;
  encounter_phrase?: string;
} = {}): EmbedBuilder {
  const {
    isForced = false,
    customTitle,
    customDescription = "Guess by using `/catch PokémonName` to try and catch it!",
    showTypes = true,
    showStats = false,
    encounter_phrase
  } = options;

  const displayName = getPokemonDisplayName(pokemon);
  const title = customTitle || encounter_phrase || generateEncounterPhrase(pokemon.name);

  // Get sprites and types
  const sprites = getPokemonSprites(pokemon, false);
  const types = formatPokemonTypes(pokemon.types);
  const primaryType = pokemon.types?.[0]?.type?.name || 'normal';

  // Set color based on type or forced status
  const embedColor = isForced ? 0xff6b6b : getPokemonTypeColor(primaryType);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(customDescription)
    .setColor(embedColor)
    .setTimestamp();

  // Add type field if requested
  if (showTypes && types.length > 0) {
    embed.addFields({
      name: "Type",
      value: types.join(" • "),
      inline: true
    });
  }

  // Add stats field if requested
  if (showStats) {
    const baseStats = getPokemonBaseStats(pokemon);
    embed.addFields({
      name: "Base Stats Total",
      value: baseStats.total.toString(),
      inline: true
    });
  }

  // Set images with proper fallback hierarchy
  if (sprites.artwork) {
    embed.setImage(sprites.artwork);
  } else if (sprites.default) {
    embed.setImage(sprites.default);
  }

  if (sprites.showdown && sprites.showdown !== sprites.artwork) {
    embed.setThumbnail(sprites.showdown);
  }

  // Add footer for special spawns
  if (isForced) {
    embed.setFooter({ text: "Force Spawned" });
  }

  return embed;
}

/**
 * Generate spawn timer with configurable bounds
 * @param min - Minimum timer in seconds
 * @param max - Maximum timer in seconds
 * @param innerMin - Inner minimum for more variation
 * @param innerMax - Inner maximum for more variation
 * @returns Random timer in seconds
 */
export function generateRandomSpawnTimer(
  min: number = 60,
  max: number = 300,
  innerMin?: number,
  innerMax?: number
): number {
  if (innerMin && innerMax) {
    return getRndInteger(
      getRndInteger(innerMin, innerMax),
      max
    );
  }

  return getRndInteger(min, max);
}

/**
 * Calculate spawn probability based on various factors
 * @param factors - Factors affecting spawn probability
 * @returns Probability as percentage (0-100)
 */
export function calculateSpawnProbability(factors: {
  timeSinceLastSpawn: number;
  baseSpawnTimer: number;
  serverActivity?: number;
  weatherBoost?: boolean;
  eventMultiplier?: number;
}): number {
  const {
    timeSinceLastSpawn,
    baseSpawnTimer,
    serverActivity = 1,
    weatherBoost = false,
    eventMultiplier = 1
  } = factors;

  // Base probability increases over time
  let probability = Math.min((timeSinceLastSpawn / baseSpawnTimer) * 100, 100);

  // Apply activity multiplier (more active servers = slightly higher spawn rate)
  probability *= (1 + (serverActivity - 1) * 0.1);

  // Weather boost
  if (weatherBoost) {
    probability *= 1.2;
  }

  // Event multiplier
  probability *= eventMultiplier;

  return Math.min(probability, 100);
}

/**
 * Check if Pokemon should have special spawn treatment
 * @param pokemon - Pokemon to check
 * @returns Object with special spawn properties
 */
export async function getPokemonSpawnRarity(pokemon: Pokemon): Promise<{
  isSpecial: boolean;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';
  embedColor?: number;
  specialText?: string;
}> {
  // Early validation
  if (!pokemon || !pokemon.id) {
    logger.warn(`Invalid pokemon data provided to getPokemonSpawnRarity: ${pokemon?.id || 'undefined'}`);
    return {
      isSpecial: false,
      rarity: 'common',
      embedColor: getPokemonTypeColor('normal')
    };
  }

  try {
    const [isLegendary, species, rarity] = await Promise.all([
      isPokemonLegendary(pokemon),
      getPokemonSpecies(pokemon.id),
      getPokemonRarity(pokemon)
    ]);

    if (species?.is_mythical) {
      return {
        isSpecial: true,
        rarity: 'mythical',
        embedColor: 0xFF1493, // Deep pink
        specialText: '✨ A mythical Pokémon has appeared! ✨'
      };
    }

    if (species?.is_legendary || isLegendary) {
      return {
        isSpecial: true,
        rarity: 'legendary',
        embedColor: 0xFFD700, // Gold
        specialText: '⭐ A legendary Pokémon has appeared! ⭐'
      };
    }

    return {
      isSpecial: false,
      rarity: rarity.category.toLowerCase() as any,
      embedColor: getPokemonTypeColor(pokemon.types?.[0]?.type?.name || 'normal')
    };
  } catch (error) {
    logger.error(`Error getting spawn rarity for Pokemon ${pokemon.id}:`, error);
    return {
      isSpecial: false,
      rarity: 'common',
      embedColor: getPokemonTypeColor('normal')
    };
  }
}

/**
 * Format spawn statistics for display
 * @param stats - Raw spawn statistics
 * @returns Formatted statistics object
 */
export function formatSpawnStats(stats: {
  lastSpawnTime: number;
  timeSinceSpawn: number;
  nextSpawnWindow: number;
  canSpawn: boolean;
  lastMonster?: string;
}): {
  formattedLastSpawn: string;
  formattedTimeSince: string;
  formattedNextWindow: string;
  status: string;
  readableStatus: string;
} {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return {
    formattedLastSpawn: formatDate(stats.lastSpawnTime),
    formattedTimeSince: formatTime(stats.timeSinceSpawn),
    formattedNextWindow: formatTime(stats.nextSpawnWindow),
    status: stats.canSpawn ? 'ready' : 'waiting',
    readableStatus: stats.canSpawn
      ? '🟢 Ready to spawn'
      : `🔴 Waiting ${formatTime(stats.nextSpawnWindow - stats.timeSinceSpawn)}`
  };
}

/**
 * Get Pokemon ID bounds for different generations or regions
 * @param constraint - Type of constraint to apply
 * @returns Object with min and max ID bounds
 */
export function getPokemonIdBounds(constraint:
  'all' | 'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar' | 'paldea'
): { minId: number; maxId: number } {
  const bounds = {
    all: { minId: 1, maxId: 1025 },
    kanto: { minId: 1, maxId: 151 },
    johto: { minId: 152, maxId: 251 },
    hoenn: { minId: 252, maxId: 386 },
    sinnoh: { minId: 387, maxId: 493 },
    unova: { minId: 494, maxId: 649 },
    kalos: { minId: 650, maxId: 721 },
    alola: { minId: 722, maxId: 809 },
    galar: { minId: 810, maxId: 905 },
    paldea: { minId: 906, maxId: 1025 }
  };

  return bounds[constraint] || bounds.all;
}

/**
 * Set up periodic cache cleanup (call this once during app initialization)
 */
export function setupCacheCleanup(): void {
  // Clean up cache every 5 minutes
  setInterval(cleanupExpiredCache, 5 * 60 * 1000);
}

// Export types for use in other modules
export { PokemonError };
export type { EvolutionChain, Pokemon, PokemonSpecies };

