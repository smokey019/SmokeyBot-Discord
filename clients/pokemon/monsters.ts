import { Collection, CommandInteraction } from 'discord.js';
import { databaseClient } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { MonsterTable, type IMonsterModel } from '../../models/Monster';
import { MonsterUserTable, type IMonsterUserModel } from '../../models/MonsterUser';
import { getRndInteger } from '../../utils';
import { queueMessage } from '../message_queue';
import PokeDex from './data/pokedex_min.json';
import {
  GenerationEight,
  GenerationExtras,
  GenerationFive,
  GenerationFour,
  GenerationOne,
  GenerationSeven,
  GenerationSix,
  GenerationThree,
  GenerationTwo
} from './pokemon-list';

const logger = getLogger('Pokémon');

// Constants for better maintainability
const MONSTER_POOL_BOOST_ITERATIONS = 100;
const RANDOM_BOOSTS_PER_ITERATION = 8;
const GENERATION_BOOST_ITERATIONS = 3;

// Cache for API responses to reduce redundant requests
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Enhanced error handling
class MonsterError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'MonsterError';
  }
}

// Pool and Dex with better initialization
const MonsterPool: Array<number> = [];
export const MonsterDex: Collection<number, IMonsterDex> = new Collection();

export type IMonsterDex = typeof PokeDex[0];

// Improved generations structure with proper typing
interface Generations {
  one: number[];
  two: number[];
  three: number[];
  four: number[];
  five: number[];
  six: number[];
  seven: number[];
  eight: number[];
  galar: IMonsterDex[];
  alola: IMonsterDex[];
  extras: number[];
}

let Gens: Generations | undefined = {
  one: GenerationOne,
  two: GenerationTwo,
  three: GenerationThree,
  four: GenerationFour,
  five: GenerationFive,
  six: GenerationSix,
  seven: GenerationSeven,
  eight: GenerationEight,
  galar: [],
  alola: [],
  extras: GenerationExtras,
};

/**
 * Validates if a monster entry has required fields
 */
function isValidMonsterEntry(element: IMonsterDex): boolean {
  return !!(
    element?.name?.english &&
    element?.type &&
    element?.images?.normal &&
    !element.name.english.match(/Gmax/)
  );
}

/**
 * Safely adds monster to pool with validation
 */
function addToMonsterPool(monsterId: number, count: number = 1): void {
  if (typeof monsterId !== 'number') {
    logger.warn(`Invalid monster ID attempted to add to pool: ${monsterId}`);
    return;
  }

  for (let i = 0; i < count; i++) {
    MonsterPool.push(monsterId);
  }
}

/**
 * Enhanced Pokedex formation with better error handling and performance
 */
async function formDex(): Promise<void> {
  try {
    logger.info('Forming Pokedex..');

    // Process each Pokemon entry
    for (const element of PokeDex) {
      try {
        // Validate and add to monster pool
        if (isValidMonsterEntry(element)) {
          // Handle forme filtering
          if (element.forme && !element.forme.match('Mega')) {
            continue;
          }

          MonsterPool.push(element.id);

          // Categorize regional variants
          if (element.region === 'Alola') {
            Gens!.alola.push(element);
          } else if (element.region === 'Galar') {
            Gens!.galar.push(element);
          }
        }

        // Add to MonsterDex if valid
        if (isValidMonsterEntry(element)) {
          MonsterDex.set(element.id, element);
        }
      } catch (error) {
        logger.error(`Error processing Pokemon entry ${element?.id || 'unknown'}:`, error);
        continue; // Continue processing other entries
      }
    }

    // Enhanced monster pool boosting with better performance
    await boostMonsterPool();

    // Clear generations to save memory
    Gens = undefined;

    logger.info(`Finished forming Pokedex. Pool size: ${MonsterPool.length}, Dex size: ${MonsterDex.size}`);
  } catch (error) {
    logger.error('Critical error during Pokedex formation:', error);
    throw new MonsterError('Failed to form Pokedex', 'POKEDEX_FORMATION_ERROR');
  }
}

/**
 * Optimized monster pool boosting logic
 */
async function boostMonsterPool(): Promise<void> {
  if (!Gens) return;

  try {
    // Add random boosts more efficiently
    for (let index = 0; index < MONSTER_POOL_BOOST_ITERATIONS; index++) {
      for (let j = 0; j < RANDOM_BOOSTS_PER_ITERATION; j++) {
        const randomMonster = MonsterDex.random();
        if (randomMonster) {
          MonsterPool.push(randomMonster.id);
        }
      }
    }

    // Generation-specific boosts with configurable weights
    const generationWeights: Record<keyof Omit<Generations, 'galar' | 'alola'>, number> = {
      one: 3,
      two: 9,
      three: 2,
      four: 2,
      five: 2,
      six: 2,
      seven: 2,
      eight: 2,
      extras: 1
    };

    for (let iteration = 0; iteration < GENERATION_BOOST_ITERATIONS; iteration++) {
      Object.entries(generationWeights).forEach(([gen, weight]) => {
        const generation = Gens![gen as keyof typeof generationWeights];
        if (Array.isArray(generation)) {
          generation.forEach(element => {
            addToMonsterPool(element, weight);
          });
        }
      });

      // Handle regional variants
      ['alola', 'galar'].forEach(region => {
        const regionMons = Gens![region as 'alola' | 'galar'];
        regionMons.forEach(element => {
          addToMonsterPool(element.id, 2);
        });
      });
    }
  } catch (error) {
    logger.error('Error during monster pool boosting:', error);
    // Continue execution even if boosting fails
  }
}

/**
 * API caching utility
 */
function getCachedData(key: string): any | null {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Set cached data
 */
function setCachedData(key: string, data: any): void {
  apiCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Enhanced API fetch with error handling and caching
 */
async function fetchWithCache(url: string, cacheKey: string): Promise<any> {
  const cached = getCachedData(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new MonsterError(`HTTP ${response.status}: ${response.statusText}`, 'API_ERROR');
    }

    const data = await response.json();
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    logger.error(`Failed to fetch from ${url}:`, error);
    throw error;
  }
}

// Initialize the Pokedex
formDex().catch(error => {
  logger.error('Failed to initialize Pokedex:', error);
});

// ============================================================================
// PUBLIC API - All functions below maintain backward compatibility
// ============================================================================

/**
 * Return monster spawn pool
 * @returns Array of monster IDs in the spawn pool
 */
export function getAllMonsters(): number[] {
  return [...MonsterPool]; // Return a copy to prevent external modification
}

/**
 * Return pokedex Collection
 * @returns Collection containing all monster dex data
 */
export function getPokedex(): Collection<number, IMonsterDex> {
  return MonsterDex;
}

/**
 * Get a random monster from the spawn pool
 * @returns Random monster ID from the pool
 */
export function getRandomMonster(): number {
  if (MonsterPool.length === 0) {
    logger.warn('Monster pool is empty, cannot get random monster');
    return 1; // Fallback to Bulbasaur
  }
  return MonsterPool[getRndInteger(0, MonsterPool.length - 1)];
}

/**
 * Get monster's dex info by its number
 * @param id Monster number
 * @returns Monster dex data or undefined if not found
 */
export async function findMonsterByID(id: number): Promise<IMonsterDex | undefined> {
  if (typeof id !== 'number' || id <= 0) {
    logger.warn(`Invalid monster ID provided: ${id}`);
    return undefined;
  }

  try {
    const monster = MonsterDex.find((mon) => mon.id === id);
    return monster;
  } catch (error) {
    logger.error(`Error finding monster by ID ${id}:`, error);
    return undefined;
  }
}

/**
 * Get monster data from PokeAPI by ID
 * @param id Monster ID
 * @returns API response data
 */
export async function findMonsterByIDAPI(id: number): Promise<any> {
  if (typeof id !== 'number' || id <= 0) {
    throw new MonsterError('Invalid monster ID provided', 'INVALID_ID');
  }

  const fixedId = id.toString().replace('.', '');
  const cacheKey = `pokemon-${fixedId}`;

  return await fetchWithCache(`https://pokeapi.co/api/v2/pokemon/${fixedId}`, cacheKey);
}

/**
 * Get monster's dex info by ID from local collection (synchronous)
 * @param id Monster number
 * @returns Monster dex data or undefined if not found
 */
export function findMonsterByIDLocal(id: number): IMonsterDex | undefined {
  if (typeof id !== 'number' || id <= 0) {
    logger.warn(`Invalid monster ID provided: ${id}`);
    return undefined;
  }

  return MonsterDex.get(id);
}

/**
 * Get monster data from PokeAPI by name
 * @param name Monster name
 * @returns API response data
 */
export async function findMonsterByNameAPI(name: string): Promise<any> {
  if (!name || typeof name !== 'string') {
    throw new MonsterError('Invalid monster name provided', 'INVALID_NAME');
  }

  const normalizedName = name.toLowerCase().trim();
  const cacheKey = `pokemon-name-${normalizedName}`;

  return await fetchWithCache(`https://pokeapi.co/api/v2/pokemon/${normalizedName}`, cacheKey);
}

/**
 * Get Pokemon evolution chain from PokeAPI
 * @param id Evolution chain ID
 * @returns Evolution chain data
 */
export async function getPokemonEvolutions(id: number): Promise<any> {
  if (typeof id !== 'number' || id <= 0) {
    throw new MonsterError('Invalid evolution chain ID provided', 'INVALID_ID');
  }

  const cacheKey = `evolution-${id}`;
  return await fetchWithCache(`https://pokeapi.co/api/v2/evolution-chain/${id}`, cacheKey);
}

/**
 * Find monster by its name in local dex
 * @param name Monster name to search for
 * @returns Monster dex data or undefined if not found
 */
export function findMonsterByName(name: string): IMonsterDex | undefined {
  if (!name || typeof name !== 'string') {
    logger.warn('Invalid name provided to findMonsterByName');
    return undefined;
  }

  try {
    const normalizedSearchName = name.toLowerCase().trim();

    // Use find method for better performance than forEach
    const monster = MonsterDex.find(element => {
      if (!element?.name?.english) return false;

      const normalizedMonsterName = element.name.english
        .toLowerCase()
        .replace(/♂|♀/g, '');

      return normalizedMonsterName === normalizedSearchName;
    });

    return monster;
  } catch (error) {
    logger.error(`Error finding monster by name "${name}":`, error);
    return undefined;
  }
}

/**
 * Return total monster count for stats
 * @returns Promise resolving to total monster count
 */
export async function getMonsterDBCount(): Promise<string> {
  try {
    const db_monster = await databaseClient<IMonsterModel>(MonsterTable).count('id as count').first();
    return db_monster || '0';
  } catch (error) {
    logger.error('Error getting monster DB count:', error);
    throw new MonsterError('Failed to get monster count', 'DB_ERROR');
  }
}

/**
 * Return total shiny monster count for stats
 * @returns Promise resolving to shiny monster count
 */
export async function getShinyMonsterDBCount(): Promise<string> {
  try {
    const db_monster = await databaseClient<IMonsterModel>(MonsterTable)
      .count('id as count')
      .where('shiny', 1).first();
    return db_monster || '0';
  } catch (error) {
    logger.error('Error getting shiny monster DB count:', error);
    throw new MonsterError('Failed to get shiny monster count', 'DB_ERROR');
  }
}

/**
 * Return user's monster database info
 * @param monster_id Database ID
 * @returns Promise resolving to monster data or undefined
 */
export async function getUserMonster(
  monster_id: string | number,
): Promise<IMonsterModel | undefined> {
  if (!monster_id) {
    logger.warn('No monster ID provided to getUserMonster');
    return undefined;
  }

  try {
    const db_monster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where('id', monster_id)
      .first(); // Use first() instead of array indexing

    return db_monster;
  } catch (error) {
    logger.error(`Error getting user monster ${monster_id}:`, error);
    throw new MonsterError('Failed to get user monster', 'DB_ERROR');
  }
}

/**
 * Get a user's monsters
 * @param uid Discord ID
 * @param released 0 | 1, default 0
 * @returns Promise resolving to array of monster models
 */
export async function getUsersMonsters(
  uid: string,
  released: 0 | 1 = 0,
): Promise<IMonsterModel[]> {
  if (!uid || typeof uid !== 'string') {
    logger.warn('Invalid UID provided to getUsersMonsters');
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
    throw new MonsterError('Failed to get user monsters', 'DB_ERROR');
  }
}

/**
 * Get a user's favorite monsters
 * @param uid Discord ID
 * @param released 0 | 1, default 0
 * @returns Promise resolving to array of favorite monster models
 */
export async function getUsersFavoriteMonsters(
  uid: string,
  released: 0 | 1 = 0,
): Promise<IMonsterModel[]> {
  if (!uid || typeof uid !== 'string') {
    logger.warn('Invalid UID provided to getUsersFavoriteMonsters');
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
    throw new MonsterError('Failed to get user favorite monsters', 'DB_ERROR');
  }
}

/**
 * Select a monster for a user
 * @param interaction Discord command interaction
 * @returns Promise resolving to success boolean
 */
export async function selectMonster(
  interaction: CommandInteraction,
): Promise<boolean> {
  if (!interaction?.options?.get('pokemon')) {
    logger.warn('No pokemon option provided in selectMonster');
    return false;
  }

  try {
    const tmp = interaction.options.get('pokemon')!.value!.toString();

    const monster: IMonsterModel | undefined = await getUserMonster(tmp);
    if (!monster) {
      logger.warn(`Monster not found for selection: ${tmp}`);
      return false;
    }

    const dex = await findMonsterByID(monster.monster_id);
    if (!dex) {
      logger.error(`Dex entry not found for monster ID: ${monster.monster_id}`);
      return false;
    }

    if (monster.uid !== interaction.user.id) {
      logger.warn(`User ${interaction.user.id} attempted to select monster owned by ${monster.uid}`);
      return false;
    }

    const updateResult = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: interaction.user.id })
      .update({ current_monster: parseInt(tmp) });

    if (updateResult) {
      await queueMessage(
        `Selected **Level ${monster.level} ${dex.name.english}**!`,
        interaction,
        true,
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error in selectMonster:', error);
    return false;
  }
}

/**
 * Set a monster as favorite
 * @param interaction Discord command interaction
 * @returns Promise resolving to success boolean
 */
export async function setFavorite(
  interaction: CommandInteraction,
): Promise<boolean> {
  if (!interaction?.options?.get('pokemon')) {
    logger.warn('No pokemon option provided in setFavorite');
    return false;
  }

  try {
    const tmp = interaction.options.get('pokemon')!.value!.toString();

    const monster: IMonsterModel | undefined = await getUserMonster(tmp);
    if (!monster) {
      logger.warn(`Monster not found for favoriting: ${tmp}`);
      return false;
    }

    const dex = await findMonsterByID(monster.monster_id);
    if (!dex) {
      logger.error(`Dex entry not found for monster ID: ${monster.monster_id}`);
      return false;
    }

    if (monster.uid !== interaction.user.id) {
      logger.warn(`User ${interaction.user.id} attempted to favorite monster owned by ${monster.uid}`);
      return false;
    }

    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', monster.id)
      .update({ favorite: 1 });

    if (updateResult) {
      await queueMessage(
        `Favorited monster **Level ${monster.level} ${dex.name.english}**!`,
        interaction,
        true,
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error in setFavorite:', error);
    return false;
  }
}

/**
 * Remove favorite status from a monster
 * @param interaction Discord command interaction
 * @returns Promise resolving to success boolean
 */
export async function unFavorite(
  interaction: CommandInteraction,
): Promise<boolean> {
  if (!interaction?.options?.get('pokemon')) {
    logger.warn('No pokemon option provided in unFavorite');
    return false;
  }

  try {
    const tmp = interaction.options.get('pokemon')!.value!.toString();

    const monster: IMonsterModel | undefined = await getUserMonster(tmp);
    if (!monster) {
      logger.warn(`Monster not found for unfavoriting: ${tmp}`);
      return false;
    }

    if (monster.uid !== interaction.user.id) {
      logger.warn(`User ${interaction.user.id} attempted to unfavorite monster owned by ${monster.uid}`);
      return false;
    }

    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', monster.id)
      .update({ favorite: 0 });

    if (updateResult) {
      await queueMessage(
        `Unfavorited monster id ${monster.id}!`,
        interaction,
        true
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error in unFavorite:', error);
    return false;
  }
}

// ============================================================================
// ADDITIONAL UTILITY FUNCTIONS (New additions that don't break compatibility)
// ============================================================================

/**
 * Clear API cache (useful for memory management)
 */
export function clearApiCache(): void {
  apiCache.clear();
  logger.info('API cache cleared');
}

/**
 * Get cache statistics
 * @returns Object containing cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: apiCache.size,
    keys: Array.from(apiCache.keys())
  };
}

/**
 * Check if Pokedex is properly initialized
 * @returns Boolean indicating if the dex is ready
 */
export function isPokedexReady(): boolean {
  return MonsterDex.size > 0 && MonsterPool.length > 0;
}

/**
 * Get pool statistics
 * @returns Object with pool information
 */
export function getPoolStats(): { poolSize: number; dexSize: number; uniqueIds: number } {
  const uniqueIds = new Set(MonsterPool).size;
  return {
    poolSize: MonsterPool.length,
    dexSize: MonsterDex.size,
    uniqueIds
  };
}