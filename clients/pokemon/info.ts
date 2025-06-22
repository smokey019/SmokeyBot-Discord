import { CommandInteraction, EmbedBuilder, type EmbedField } from "discord.js";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { format_number } from "../../utils";
import { queueMessage } from "../message_queue";
import {
  MonsterDex,
  findMonsterByIDAPI,
  findMonsterByName,
  type IMonsterDex,
} from "./monsters";
import { capitalizeFirstLetter, img_monster_ball } from "./utils";

const logger = getLogger("Info");

// Constants for better maintainability
const MAX_IV = 31;
const IV_TOTAL = 186; // 31 * 6 stats
const EXPERIENCE_MULTIPLIER = 1250;
const POKEMON_DB_BASE_URL = "https://pokemondb.net/pokedex/";
const NATIONAL_NUMBER_PADDING = 5;
const DEX_NUMBER_PADDING = 3;

// Stat calculation constants
const STAT_FORMULA_BASE = 2;
const STAT_FORMULA_LEVEL_OFFSET = 10;
const HP_STAT_FORMULA_OFFSET = 10;

// Enhanced error handling
class InfoError extends Error {
  constructor(message: string, public code: string, public userId?: string) {
    super(message);
    this.name = 'InfoError';
  }
}

// Enhanced interfaces for better type safety
interface MonsterStats {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
}

interface MonsterImages {
  normal?: string;
  shiny?: string;
  gif?: string;
  'gif-shiny'?: string;
  thumbnail?: string;
  thumbnailShiny?: string;
}

interface StatCalculationInput {
  baseStat: number;
  iv: number;
  level: number;
  isHP?: boolean;
}

interface EmbedDisplayOptions {
  title: string;
  description: string;
  image?: string;
  thumbnail?: string;
  fields?: EmbedField[];
  url?: string;
  authorIcon?: string;
}

// Cache for frequently accessed data
const statCalculationCache = new Map<string, number>();
const userDexCache = new Map<string, { data: number[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Calculates Pokemon stats using the standard formula
 */
function calculateStat({ baseStat, iv, level, isHP = false }: StatCalculationInput): number {
  const cacheKey = `${baseStat}-${iv}-${level}-${isHP}`;

  if (statCalculationCache.has(cacheKey)) {
    return statCalculationCache.get(cacheKey)!;
  }

  let stat: number;

  if (isHP) {
    stat = Math.round(
      STAT_FORMULA_BASE * baseStat +
      (iv * level) / 100 +
      level +
      HP_STAT_FORMULA_OFFSET
    );
  } else {
    stat = Math.round(
      STAT_FORMULA_BASE * baseStat +
      (iv * level) / 100 +
      level +
      STAT_FORMULA_LEVEL_OFFSET
    );
  }

  statCalculationCache.set(cacheKey, stat);
  return stat;
}

/**
 * Calculates all Pokemon stats from API data and IV values
 */
function calculateAllStats(apiStats: any[], monsterData: IMonsterModel): MonsterStats {
  const stats: MonsterStats = {
    hp: 0,
    attack: 0,
    defense: 0,
    sp_attack: 0,
    sp_defense: 0,
    speed: 0,
  };

  const statMapping: Record<string, keyof MonsterStats> = {
    'hp': 'hp',
    'attack': 'attack',
    'defense': 'defense',
    'special-attack': 'sp_attack',
    'special-defense': 'sp_defense',
    'speed': 'speed'
  };

  for (const apiStat of apiStats) {
    const statName = statMapping[apiStat.stat.name];
    if (statName) {
      stats[statName] = calculateStat({
        baseStat: apiStat.base_stat,
        iv: monsterData[statName],
        level: monsterData.level,
        isHP: statName === 'hp'
      });
    }
  }

  return stats;
}

/**
 * Calculates average IV percentage
 */
function calculateAverageIV(monsterData: IMonsterModel): number {
  const totalIV = monsterData.hp + monsterData.attack + monsterData.defense +
                  monsterData.sp_attack + monsterData.sp_defense + monsterData.speed;
  return (totalIV / IV_TOTAL) * 100;
}

/**
 * Gets appropriate Pokemon images based on shiny status and regional forms
 */
function getPokemonImages(monster: any, isShiny: boolean): MonsterImages {
  const images: MonsterImages = {};

  try {
    if (isShiny) {
      images.normal = monster.sprites?.other?.["official-artwork"]?.front_shiny;
      images.thumbnail = monster.sprites?.other?.["showdown"]?.front_shiny;
    } else {
      images.normal = monster.sprites?.other?.["official-artwork"]?.front_default;
      images.thumbnail = monster.sprites?.other?.["showdown"]?.front_default;
    }

    // Fallback to regular sprites if official artwork not available
    if (!images.normal) {
      images.normal = isShiny ? monster.sprites?.front_shiny : monster.sprites?.front_default;
    }

    if (!images.thumbnail) {
      images.thumbnail = images.normal;
    }
  } catch (error) {
    logger.warn('Failed to get Pokemon images:', error);
    // Provide fallback empty strings to prevent undefined errors
    images.normal = '';
    images.thumbnail = '';
  }

  return images;
}

/**
 * Gets Pokemon images for dex entries
 */
function getDexImages(dexEntry: IMonsterDex, isShiny: boolean): MonsterImages {
  const images: MonsterImages = {};

  try {
    if (dexEntry.region || dexEntry.forme) {
      images.thumbnail = isShiny ? dexEntry.images?.["gif-shiny"] : dexEntry.images?.gif;
      images.normal = isShiny ? dexEntry.images?.shiny : dexEntry.images?.normal;
    } else {
      images.thumbnail = isShiny ? dexEntry.images?.["gif-shiny"] : dexEntry.images?.gif;
      images.normal = isShiny ? dexEntry.images?.shiny : dexEntry.images?.normal;
    }

    // Fallback to normal images if shiny not available
    if (isShiny && !images.normal) {
      images.normal = dexEntry.images?.normal || '';
    }
    if (isShiny && !images.thumbnail) {
      images.thumbnail = dexEntry.images?.gif || '';
    }
  } catch (error) {
    logger.warn('Failed to get dex images:', error);
    images.normal = '';
    images.thumbnail = '';
  }

  return images;
}

/**
 * Formats Pokemon types for display
 */
function formatPokemonTypes(types: any[]): string[] {
  if (!Array.isArray(types)) {
    return [];
  }

  return types.map(typeData => {
    if (typeof typeData === 'string') {
      return capitalizeFirstLetter(typeData);
    }
    return capitalizeFirstLetter(typeData?.type?.name || '');
  }).filter(Boolean);
}

/**
 * Formats date for display
 */
function formatDate(timestamp: number, includeTime: boolean = false): string {
  try {
    const date = new Date(timestamp);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    if (includeTime) {
      options.hour = "numeric";
      options.minute = "numeric";
    }

    return date.toLocaleDateString("en-US", options);
  } catch (error) {
    logger.error('Failed to format date:', error);
    return 'Unknown Date';
  }
}

/**
 * Creates embed fields for monster stats
 */
function createStatsFields(stats: MonsterStats, monsterData: IMonsterModel): EmbedField[] {
  const fields: EmbedField[] = [
    {
      name: "**HP**",
      value: `${stats.hp} \n IV: ${monsterData.hp}/${MAX_IV}`,
      inline: true,
    },
    {
      name: "**Attack**",
      value: `${stats.attack} \n IV: ${monsterData.attack}/${MAX_IV}`,
      inline: true,
    },
    {
      name: "**Defense**",
      value: `${stats.defense} \n IV: ${monsterData.defense}/${MAX_IV}`,
      inline: true,
    },
    {
      name: "**Sp. Atk**",
      value: `${stats.sp_attack} \n IV: ${monsterData.sp_attack}/${MAX_IV}`,
      inline: true,
    },
    {
      name: "**Sp. Def**",
      value: `${stats.sp_defense} \n IV: ${monsterData.sp_defense}/${MAX_IV}`,
      inline: true,
    },
    {
      name: "**Speed**",
      value: `${stats.speed} \n IV: ${monsterData.speed}/${MAX_IV}\n`,
      inline: true,
    }
  ];

  return fields;
}

/**
 * Creates a standardized embed for Pokemon information
 */
function createPokemonEmbed(options: EmbedDisplayOptions): EmbedBuilder {
  const embed = new EmbedBuilder();

  if (options.title) {
    embed.setAuthor({
      name: options.title,
      iconURL: options.authorIcon || img_monster_ball,
      url: options.url
    });
  }

  if (options.description) {
    embed.setDescription(options.description);
  }

  if (options.image) {
    embed.setImage(options.image);
  }

  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }

  if (options.fields) {
    embed.addFields(options.fields);
  }

  return embed;
}

/**
 * Safely sends an embed response with error handling
 */
async function sendEmbedResponse(
  interaction: CommandInteraction,
  embed: EmbedBuilder,
  isReply: boolean = true
): Promise<void> {
  try {
    if (isReply) {
      await queueMessage({ embeds: [embed] }, interaction, false);
    } else {
      await interaction.channel?.send({ embeds: [embed] });
    }
  } catch (error) {
    logger.error('Failed to send embed response:', error);

    // Fallback to simple text response
    try {
      const fallbackMessage = "Error displaying Pokémon information. Please try again.";
      if (isReply) {
        await queueMessage(fallbackMessage, interaction, false);
      } else {
        await interaction.channel?.send(fallbackMessage);
      }
    } catch (fallbackError) {
      logger.error('Failed to send fallback response:', fallbackError);
    }
  }
}

/**
 * Enhanced version of checkUniqueMonsters with better error handling
 */
export async function checkUniqueMonsters(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;

  try {
    const userPokedex = await userDex(userId);
    const totalPokemon = MonsterDex.size;
    const uniqueCount = userPokedex.length;

    await queueMessage(
      `You have ${uniqueCount}/${totalPokemon} total unique Pokémon in your Pokédex.`,
      interaction,
      true
    );

    logger.debug(`Sent unique Pokemon count for user ${userId}: ${uniqueCount}/${totalPokemon}`);
  } catch (error) {
    logger.error(`Error getting unique monsters for user ${userId}:`, error);
    await queueMessage(
      "An error occurred while checking your Pokédex. Please try again.",
      interaction,
      true
    );
  }
}

/**
 * Enhanced monsterEmbed with improved error handling and performance
 */
export async function monsterEmbed(
  monster_db: IMonsterModel,
  interaction: CommandInteraction
): Promise<void> {
  if (!monster_db) {
    logger.warn('No monster data provided to monsterEmbed');
    return;
  }

  const userId = interaction.user.id;

  try {
    // Fetch API data for the monster
    const apiMonster = await findMonsterByIDAPI(monster_db.monster_id);

    if (!apiMonster) {
      logger.error(`Failed to fetch API data for monster ID: ${monster_db.monster_id}`);
      await queueMessage("Failed to load Pokémon information. Please try again.", interaction, false);
      return;
    }

    // Format Pokemon types
    const pokemonTypes = formatPokemonTypes(apiMonster.types);
    const typeString = pokemonTypes.join(" | ");

    // Calculate stats
    const calculatedStats = calculateAllStats(apiMonster.stats, monster_db);
    const averageIV = calculateAverageIV(monster_db);

    // Format IDs and experience
    const nationalNumber = `${apiMonster.id}`.padStart(NATIONAL_NUMBER_PADDING, "0");
    const nextLevelExp = monster_db.level * EXPERIENCE_MULTIPLIER;

    // Get images
    const images = getPokemonImages(apiMonster, Boolean(monster_db.shiny));

    // Format display icons and text
    const shinyIcon = monster_db.shiny ? " ⭐" : "";
    const favoriteIcon = monster_db.favorite ? " 💟" : "";
    const genderIcon = formatGenderIcon(apiMonster, monster_db.gender);

    // Create title
    let title = `Level ${monster_db.level} ${capitalizeFirstLetter(apiMonster.name)}${genderIcon}${shinyIcon}${favoriteIcon}`;

    if (monster_db.nickname) {
      title = `Level ${monster_db.level} '${monster_db.nickname}' - ${capitalizeFirstLetter(apiMonster.name)}${genderIcon}${shinyIcon}${favoriteIcon}`;
    }

    // Create embed fields
    const embedFields: EmbedField[] = [
      {
        name: "**ID**",
        value: monster_db.id.toString(),
        inline: true,
      },
      {
        name: "**National №**",
        value: nationalNumber,
        inline: true
      },
      {
        name: "**Level**",
        value: monster_db.level.toString(),
        inline: true,
      },
      {
        name: "**Exp**",
        value: `${format_number(monster_db.experience)} / ${format_number(nextLevelExp)}`,
        inline: false,
      },
      {
        name: "**Type**",
        value: typeString,
        inline: false,
      }
    ];

    // Add stat fields
    embedFields.push(...createStatsFields(calculatedStats, monster_db));

    // Add IV percentage
    embedFields.push({
      name: "**Total IV %**",
      value: `${averageIV.toFixed(2)}%`,
      inline: true,
    });

    // Add ownership information
    embedFields.push({
      name: "**Current Owner**",
      value: `<@${monster_db.uid}>`,
      inline: true,
    });

    if (monster_db.original_uid !== monster_db.uid) {
      embedFields.push({
        name: "**Original Owner**",
        value: `<@${monster_db.original_uid}>`,
        inline: true,
      });
    }

    // Add special information
    let description = "";

    if (monster_db.released) {
      const releaseDate = formatDate(monster_db.released_at);
      description = `\n***Released on ${releaseDate}***\n\n`;
    }

    if (monster_db.egg && monster_db.hatched_at) {
      const hatchedDate = formatDate(monster_db.hatched_at, true);
      embedFields.push({
        name: "**Hatched On**",
        value: hatchedDate,
        inline: true,
      });
    }

    // Create and send embed
    const embed = createPokemonEmbed({
      title,
      description,
      image: images.normal,
      thumbnail: images.thumbnail,
      fields: embedFields,
      url: `${POKEMON_DB_BASE_URL}${apiMonster.id}`,
      authorIcon: img_monster_ball
    });

    await sendEmbedResponse(interaction, embed, true);
    logger.debug(`Sent monster embed for monster ID ${monster_db.id} to user ${userId}`);

  } catch (error) {
    logger.error(`Error creating monster embed for monster ${monster_db.id}:`, error);
    await queueMessage("An error occurred while displaying Pokémon information. Please try again.", interaction, false);
  }
}

/**
 * Formats gender icon based on Pokemon data
 */
function formatGenderIcon(apiMonster: any, gender: string): string {
  try {
    if (apiMonster.sprites?.front_female) {
      if (gender === "M") {
        return "♂️ ";
      } else if (gender === "F") {
        return "♀️ ";
      }
    }
    return "";
  } catch (error) {
    logger.warn('Failed to format gender icon:', error);
    return "";
  }
}

/**
 * Enhanced monsterInfoLatest with better error handling
 */
export async function monsterInfoLatest(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .select()
      .where("uid", userId)
      .first();

    if (!user) {
      await queueMessage("You don't have any Pokémon yet. Catch some first!", interaction, false);
      return;
    }

    if (!user.latest_monster) {
      await queueMessage("No recent Pokémon found. Catch a Pokémon first!", interaction, false);
      return;
    }

    const monster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", user.latest_monster)
      .first();

    if (!monster) {
      await queueMessage("Latest Pokémon not found. Please try catching another one.", interaction, false);
      return;
    }

    await monsterEmbed(monster, interaction);

  } catch (error) {
    logger.error(`Error getting latest monster info for user ${userId}:`, error);
    await queueMessage("An error occurred while getting your latest Pokémon. Please try again.", interaction, false);
  }
}

/**
 * Enhanced monsterInfo with better validation
 */
export async function monsterInfo(
  interaction: CommandInteraction,
  monster_id: string
): Promise<void> {
  if (!monster_id || typeof monster_id !== 'string') {
    await queueMessage("Please provide a valid monster ID.", interaction, false);
    return;
  }

  const userId = interaction.user.id;

  try {
    const monster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", monster_id)
      .first();

    if (!monster) {
      await queueMessage("Monster not found. Please check the ID and try again.", interaction, false);
      return;
    }

    await monsterEmbed(monster, interaction);
    logger.debug(`Sent monster info for ID ${monster_id} to user ${userId}`);

  } catch (error) {
    logger.error(`Error getting monster info for ID ${monster_id}:`, error);
    await queueMessage("An error occurred while getting Pokémon information. Please try again.", interaction, false);
  }
}

/**
 * Enhanced currentMonsterInfo with better error handling
 */
export async function currentMonsterInfo(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user: IMonsterUserModel = await getUser(userId);

    if (!user) {
      await queueMessage("User profile not found. Please try catching a Pokémon first.", interaction, false);
      return;
    }

    if (!user.current_monster) {
      await queueMessage("No current Pokémon selected. Use the select command to choose one.", interaction, false);
      return;
    }

    const monster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", user.current_monster)
      .first();

    if (!monster) {
      await queueMessage("Current Pokémon not found. Please select a different one.", interaction, false);
      return;
    }

    await monsterEmbed(monster, interaction);
    logger.debug(`Sent current monster info for user ${userId}`);

  } catch (error) {
    logger.error(`Error getting current monster info for user ${userId}:`, error);
    await queueMessage("An error occurred while getting your current Pokémon. Please try again.", interaction, false);
  }
}

/**
 * Enhanced monsterDex with better error handling and parsing
 */
export async function monsterDex(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;

  try {
    const pokemonOption = interaction.options.get("pokemon")?.value?.toString();

    if (!pokemonOption) {
      await queueMessage("Please provide a Pokémon name.", interaction, false);
      return;
    }

    const searchShiny = pokemonOption.match(/shiny/i);
    let searchTerm = pokemonOption;

    if (searchShiny) {
      searchTerm = searchTerm.replace(/shiny/i, "").trim();
    }

    const dexEntry = findMonsterByName(searchTerm.toLowerCase());

    if (!dexEntry) {
      await queueMessage(`Pokémon "${searchTerm}" not found in the Pokédex.`, interaction, false);
      return;
    }

    // Format Pokemon data
    const pokemonTypes = Array.isArray(dexEntry.type) ? dexEntry.type.join(" | ") : String(dexEntry.type);
    const dexNumber = `${dexEntry.id}`.padStart(DEX_NUMBER_PADDING, "0");
    const count = await monsterCount(dexEntry.id, userId);

    // Get images
    const images = getDexImages(dexEntry, Boolean(searchShiny));

    // Format stats
    const baseStats = dexEntry.baseStats;
    const stats = {
      hp: baseStats.hp,
      attack: baseStats.atk,
      defense: baseStats.def,
      sp_attack: baseStats.spa,
      sp_defense: baseStats.spd,
      speed: baseStats.spe,
    };

    // Format evolution info
    const evolves = dexEntry.evos?.join(" | ") ?? "None";
    const prevolves = dexEntry.prevo ?? "None";

    let evoItem = "";
    if (dexEntry.evos && dexEntry.evos.length > 0) {
      const evolution = findMonsterByName(dexEntry.evos[0]);
      if (evolution?.evoItem) {
        evoItem = ` with item ${evolution.evoItem}`;
      }
    }

    // Special indicator
    const legendaryIcon = dexEntry.special ? " 💠" : "";

    const description = `**Type(s)**: ${pokemonTypes}

**National №**: ${dexNumber}
**Your PokeDex Count**: ${format_number(parseInt(count))}

**Base Stats**

**HP**: ${stats.hp}
**Attack**: ${stats.attack}
**Defense**: ${stats.defense}
**Sp. Atk**: ${stats.sp_attack}
**Sp. Def**: ${stats.sp_defense}
**Speed**: ${stats.speed}

**Prevolve**: ${prevolves}
**Evolve**: ${evolves}${evoItem}`;

    const embed = createPokemonEmbed({
      title: `#${dexNumber} - ${dexEntry.name.english}${legendaryIcon}`,
      description,
      image: images.normal,
      thumbnail: images.thumbnail
    });

    await sendEmbedResponse(interaction, embed, false);
    logger.debug(`Sent dex info for ${dexEntry.name.english} to user ${userId}`);

  } catch (error) {
    logger.error(`Error getting dex info for user ${userId}:`, error);
    await queueMessage("An error occurred while getting Pokédex information. Please try again.", interaction, false);
  }
}

/**
 * Enhanced monsterCount with better error handling
 */
export async function monsterCount(id: number, uid: string): Promise<string> {
  if (!id || !uid) {
    logger.warn('Invalid parameters provided to monsterCount');
    return '0';
  }

  try {
    const result = await databaseClient<IMonsterModel>(MonsterTable)
      .count('id as count')
      .where({
        monster_id: id,
        uid: uid,
      })
      .first();

    return result || '0';
  } catch (error) {
    logger.error(`Error getting monster count for ID ${id}, user ${uid}:`, error);
    return '0';
  }
}

/**
 * Enhanced userDex with caching and better performance
 */
export async function userDex(user: string): Promise<number[]> {
  if (!user) {
    logger.warn('No user ID provided to userDex');
    return [];
  }

  // Check cache first
  const cached = userDexCache.get(user);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
      .distinct('monster_id')
      .where('uid', user)
      .select('monster_id');

    const dexArray = pokemon.map(p => p.monster_id);

    // Cache the result
    userDexCache.set(user, {
      data: dexArray,
      timestamp: Date.now()
    });

    return dexArray;
  } catch (error) {
    logger.error(`Error getting user dex for user ${user}:`, error);
    return [];
  }
}

// ============================================================================
// UTILITY FUNCTIONS (Additional exports for testing and debugging)
// ============================================================================

/**
 * Export for testing - calculates individual stat
 */
export function calculateSingleStat(baseStat: number, iv: number, level: number, isHP: boolean = false): number {
  return calculateStat({ baseStat, iv, level, isHP });
}

/**
 * Export for testing - calculates average IV
 */
export function calculateIVAverage(monster: IMonsterModel): number {
  return calculateAverageIV(monster);
}

/**
 * Export for testing - formats Pokemon types
 */
export function formatTypes(types: any[]): string[] {
  return formatPokemonTypes(types);
}

/**
 * Clear user dex cache for a specific user or all users
 */
export function clearUserDexCache(userId?: string): void {
  if (userId) {
    userDexCache.delete(userId);
  } else {
    userDexCache.clear();
  }
  logger.debug(`Cleared user dex cache${userId ? ` for user ${userId}` : ''}`);
}

/**
 * Clear stat calculation cache
 */
export function clearStatCache(): void {
  statCalculationCache.clear();
  logger.debug('Cleared stat calculation cache');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  userDexCacheSize: number;
  statCacheSize: number;
  userDexKeys: string[];
} {
  return {
    userDexCacheSize: userDexCache.size,
    statCacheSize: statCalculationCache.size,
    userDexKeys: Array.from(userDexCache.keys())
  };
}