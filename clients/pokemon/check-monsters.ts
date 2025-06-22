import { CommandInteraction, EmbedBuilder } from "discord.js";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import type { IMonsterUserModel } from "../../models/MonsterUser";
import { chunk, format_number } from "../../utils";
import { queueMessage } from "../message_queue";
import { userDex } from "./info";
import {
  findMonsterByIDLocal,
  getPokedex,
  getUsersFavoriteMonsters,
  getUsersMonsters,
} from "./monsters";

const logger = getLogger("Pokémon");

// Constants for better maintainability
const MAX_EMBED_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 10;
const MAX_IV_TOTAL = 186; // 31 * 6 stats
const TRIM_SUFFIX = "...";

// Enhanced error handling
class CheckMonstersError extends Error {
  constructor(message: string, public code: string, public userId?: string) {
    super(message);
    this.name = 'CheckMonstersError';
  }
}

// Enums for better type safety and consistency
enum SortType {
  IV_HIGH = 'iv_high',
  IV_LOW = 'iv_low',
  LEVEL_HIGH = 'level_high',
  LEVEL_LOW = 'level_low',
  ID_HIGH = 'id_high',
  ID_LOW = 'id_low',
  SHINY_HIGH = 'shiny_high',
  SHINY_LOW = 'shiny_low',
  NAME_HIGH = 'name_high',
  NAME_LOW = 'name_low'
}

enum FilterType {
  LEGENDARY = 'legendary',
  MYTHICAL = 'mythical',
  ULTRABEAST = 'ultrabeast',
  SHINY = 'shiny',
  MEGA = 'mega'
}

// Enhanced interfaces for better type safety
interface ProcessedMonster {
  id: number;
  name: string;
  shiny: string;
  level: number;
  iv: number;
  msg: string;
  favorite?: boolean;
  special?: string;
  raw?: IMonsterModel;
}

interface SortOptions {
  type: SortType;
  ascending?: boolean;
}

interface FilterOptions {
  type?: FilterType;
  page?: number;
  showMissing?: boolean;
}

interface EmbedOptions {
  title: string;
  description: string;
  authorName: string;
  authorIcon?: string;
  authorUrl?: string;
  footer?: string;
}

/**
 * Calculates average IV percentage from individual IV values
 */
function calculateAverageIV(monster: IMonsterModel): number {
  const totalIV = monster.hp + monster.attack + monster.defense +
                  monster.sp_attack + monster.sp_defense + monster.speed;
  return parseFloat(((totalIV / MAX_IV_TOTAL) * 100).toFixed(2));
}

/**
 * Generates display icons for monster properties
 */
function getMonsterIcons(monster: IMonsterModel, dexEntry: any): {
  shiny: string;
  favorite: string;
  legendary: string;
} {
  return {
    shiny: monster.shiny ? " ⭐" : "",
    favorite: monster.favorite ? " 💟" : "",
    legendary: dexEntry?.special ? " 💠" : ""
  };
}

/**
 * Formats a monster entry for display
 */
function formatMonsterEntry(
  monster: IMonsterModel,
  dexEntry: any,
  isCurrentMonster: boolean = false
): string {
  const icons = getMonsterIcons(monster, dexEntry);
  const averageIV = calculateAverageIV(monster);

  const baseText = `**${monster.id}** - **${dexEntry.name.english}${icons.shiny}${icons.favorite}${icons.legendary}** - **Level ${monster.level}** - **Avg IV ${averageIV}%**`;

  return isCurrentMonster ? `__${baseText}__` : baseText;
}

/**
 * Enhanced sorting function with proper type handling
 */
function sortMonsters(monsters: ProcessedMonster[], sortType: string): ProcessedMonster[] {
  const sortFunctions: Record<string, (a: ProcessedMonster, b: ProcessedMonster) => number> = {
    [SortType.IV_HIGH]: (a, b) => b.iv - a.iv,
    [SortType.IV_LOW]: (a, b) => a.iv - b.iv,
    [SortType.LEVEL_HIGH]: (a, b) => b.level - a.level,
    [SortType.LEVEL_LOW]: (a, b) => a.level - b.level,
    [SortType.ID_HIGH]: (a, b) => b.id - a.id,
    [SortType.ID_LOW]: (a, b) => a.id - b.id,
    [SortType.SHINY_HIGH]: (a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0),
    [SortType.SHINY_LOW]: (a, b) => (a.shiny ? 1 : 0) - (b.shiny ? 1 : 0),
    [SortType.NAME_HIGH]: (a, b) => b.name.localeCompare(a.name),
    [SortType.NAME_LOW]: (a, b) => a.name.localeCompare(b.name),

    // Legacy sorting support for backward compatibility
    'iv high': (a, b) => b.iv - a.iv,
    'iv low': (a, b) => a.iv - b.iv,
    'level high': (a, b) => b.level - a.level,
    'level low': (a, b) => a.level - b.level,
    'id high': (a, b) => b.id - a.id,
    'id low': (a, b) => a.id - b.id,
    'shiny +': (a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0),
    'shiny -': (a, b) => (a.shiny ? 1 : 0) - (b.shiny ? 1 : 0),
    'name desc': (a, b) => b.name.localeCompare(a.name),
    'name asc': (a, b) => a.name.localeCompare(b.name)
  };

  const sortFunction = sortFunctions[sortType] || sortFunctions[SortType.ID_HIGH];
  return [...monsters].sort(sortFunction);
}

/**
 * Applies filters to monster list
 */
function filterMonsters(monsters: IMonsterModel[], filterType: string): IMonsterModel[] {
  if (!filterType) return monsters;

  return monsters.filter(monster => {
    const dexEntry = findMonsterByIDLocal(monster.monster_id);
    if (!dexEntry) return false;

    switch (filterType.toLowerCase()) {
      case FilterType.LEGENDARY:
        return dexEntry.special === 'Legendary';
      case FilterType.MYTHICAL:
        return dexEntry.special === 'Mythical';
      case FilterType.ULTRABEAST:
        return dexEntry.special === 'Ultrabeast';
      case FilterType.SHINY:
        return Boolean(monster.shiny);
      case FilterType.MEGA:
        return Boolean(dexEntry.forme);
      default:
        return true;
    }
  });
}

/**
 * Processes monsters into display format
 */
function processMonsters(
  monsters: IMonsterModel[],
  currentMonsterId?: number
): ProcessedMonster[] {
  const processed: ProcessedMonster[] = [];

  for (const monster of monsters) {
    try {
      const dexEntry = findMonsterByIDLocal(monster.monster_id);
      if (!dexEntry) {
        logger.warn(`Dex entry not found for monster ID: ${monster.monster_id}`);
        continue;
      }

      const icons = getMonsterIcons(monster, dexEntry);
      const averageIV = calculateAverageIV(monster);
      const isCurrentMonster = currentMonsterId === monster.id;

      const formattedMessage = formatMonsterEntry(monster, dexEntry, isCurrentMonster);

      processed.push({
        id: monster.id,
        name: dexEntry.name.english,
        shiny: icons.shiny,
        level: monster.level,
        iv: averageIV,
        msg: formattedMessage,
        favorite: Boolean(monster.favorite),
        special: dexEntry.special,
        raw: monster
      });
    } catch (error) {
      logger.error(`Error processing monster ${monster.id}:`, error);
      continue;
    }
  }

  return processed;
}

/**
 * Creates paginated content from message array
 */
function createPaginatedContent(
  messages: string[],
  pageSize: number = DEFAULT_PAGE_SIZE,
  currentPage: number = 0,
  totalCount?: number
): {
  content: string[];
  pageInfo: string;
  totalPages: number;
} {
  const chunks = chunk(messages, pageSize);
  const totalPages = chunks.length;

  let content = chunks[currentPage] || chunks[0] || [];

  // Add total count if provided and not paginated
  if (totalCount !== undefined && chunks.length <= 1) {
    content = [...content, `\nTotal Monsters: **${totalCount}**`];
  }

  // Add pagination info if multiple pages
  const pageInfo = totalPages > 1
    ? `Page: **${currentPage + 1}/${format_number(totalPages)}**`
    : '';

  if (pageInfo) {
    content = [...content, pageInfo];
  }

  return { content, pageInfo, totalPages };
}

/**
 * Ensures message content doesn't exceed Discord limits
 */
function ensureMessageLength(content: string): string {
  if (content.length <= MAX_EMBED_LENGTH) {
    return content;
  }

  return content.slice(0, MAX_EMBED_LENGTH - TRIM_SUFFIX.length) + TRIM_SUFFIX;
}

/**
 * Creates a standardized embed for monster listings
 */
function createMonsterEmbed(options: EmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setDescription(ensureMessageLength(options.description));

  if (options.authorName) {
    embed.setAuthor({
      name: options.authorName,
      iconURL: options.authorIcon,
      url: options.authorUrl
    });
  }

  if (options.title) {
    embed.setTitle(options.title);
  }

  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }

  return embed;
}

/**
 * Safely sends an embed response with error handling
 */
async function sendEmbedResponse(
  interaction: CommandInteraction,
  embed: EmbedBuilder,
  isReply: boolean = false
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
      const fallbackMessage = "Error displaying Pokémon list. Please try again.";
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
 * Enhanced version of checkMonstersNew with improved error handling and performance
 */
export async function checkMonstersNew(
  interaction: CommandInteraction,
  favorites?: 0 | 1
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const guildName = interaction.guild?.name;

  try {
    logger.debug(`Fetching Pokémon for ${username} in ${guildName}..`);

    // Fetch monsters based on favorites flag
    let pokemon: IMonsterModel[];
    if (favorites) {
      pokemon = await getUsersFavoriteMonsters(userId);
    } else {
      pokemon = await getUsersMonsters(userId);
    }

    if (!pokemon || pokemon.length === 0) {
      await queueMessage("You don't have any Pokémon.", interaction, true);
      return;
    }

    // Get sort option
    const sortOption = interaction.options.get("options")?.value?.toString() || SortType.ID_HIGH;

    logger.debug('Successfully fetched! Compiling..');

    // Get current monster for highlighting
    const user: IMonsterUserModel = await getUser(userId);
    const currentMonster = user?.current_monster
      ? await databaseClient<IMonsterModel>(MonsterTable)
          .first()
          .where("id", user.current_monster)
      : null;

    // Process and sort monsters
    const processedMonsters = processMonsters(pokemon, currentMonster?.id);
    const sortedMonsters = sortMonsters(processedMonsters, sortOption);

    // Create paginated content
    const messages = sortedMonsters.map(monster => monster.msg);
    const { content } = createPaginatedContent(messages, DEFAULT_PAGE_SIZE, 0, pokemon.length);

    // Create and send embed
    const embed = createMonsterEmbed({
      title: `${username}'s Pokémon\n\nShowing: ${format_number(content.length)}/${format_number(pokemon.length)}`,
      description: content.join('\n'),
      authorName: "User Profile",
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent Pokémon for ${interaction.user.tag} in ${guildName}!`);

  } catch (error) {
    logger.error(`Error in checkMonstersNew for user ${userId}:`, error);
    await queueMessage("An error occurred while fetching your Pokémon. Please try again.", interaction, true);
  }
}

/**
 * Enhanced version of checkMonsters with better parsing and error handling
 */
export async function checkMonsters(
  interaction: CommandInteraction,
  args: string[]
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const guildName = interaction.guild?.name;

  try {
    logger.debug(`Fetching Pokémon for ${username} in ${guildName}..`);

    const splitMsg = args;
    const sortKey = [splitMsg[1], splitMsg[2]].filter(Boolean).join(' ');
    const filterType = splitMsg[splitMsg.length - 1];

    let pokemon = await getUsersMonsters(userId);

    if (!pokemon || pokemon.length === 0) {
      await queueMessage("You don't have any monsters in your Pokédex. :(", interaction, false);
      return;
    }

    // Apply filters
    pokemon = filterMonsters(pokemon, filterType);

    logger.debug('Successfully fetched! Compiling..');

    // Get current monster
    const user: IMonsterUserModel = await getUser(userId);
    const currentMonster = user?.current_monster
      ? await databaseClient<IMonsterModel>(MonsterTable)
          .first()
          .where("id", user.current_monster)
      : null;

    // Process and sort monsters
    const processedMonsters = processMonsters(pokemon, currentMonster?.id);
    const sortedMonsters = sortMonsters(processedMonsters, sortKey);

    // Handle pagination
    let currentPage = 0;
    const messages = sortedMonsters.map(monster => monster.msg);

    if (splitMsg.length >= 4 && !filterType.match(/legendary|mythical|ultrabeast|shiny|mega/i)) {
      const pageNum = parseInt(splitMsg[splitMsg.length - 1]);
      if (!isNaN(pageNum) && pageNum > 0) {
        currentPage = pageNum - 1;
      }
    }

    const { content } = createPaginatedContent(messages, DEFAULT_PAGE_SIZE, currentPage);

    // Create and send embed
    const embed = createMonsterEmbed({
      title: ``,
      description: content.join('\n'),
      authorName: `${username}'s Pokémon\nShowing: ${format_number(content.length)}/${format_number(pokemon.length)}`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent Pokémon for ${interaction.user.tag} in ${guildName}!`);

  } catch (error) {
    logger.error(`Error in checkMonsters for user ${userId}:`, error);
    await queueMessage("An error occurred while fetching your Pokémon. Please try again.", interaction, false);
  }
}

/**
 * Enhanced Pokedex checker with better performance and error handling
 */
export async function checkPokedex(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;

  try {
    const [userPokemon, pokedex] = await Promise.all([
      userDex(userId),
      Promise.resolve(getPokedex())
    ]);

    const showMissing = interaction.options.get("missing")?.value as boolean;
    const msgArray: string[] = [];
    let pokemonCount = 0;

    // Create a Set for faster lookups
    const userPokemonSet = new Set(userPokemon);

    pokedex.forEach((dex) => {
      if (!dex.images?.normal) return;

      const count = userPokemon.filter(id => id === dex.id).length;
      const hasMonster = userPokemonSet.has(dex.id);

      if (hasMonster && !showMissing) {
        msgArray.push(`**${dex.id}** - **${dex.name.english}** - **${count}**`);
        pokemonCount++;
      } else if (!hasMonster && showMissing) {
        msgArray.push(`**${dex.id}** - **${dex.name.english}** - **0**`);
        pokemonCount++;
      } else if (!showMissing) {
        msgArray.push(`**${dex.id}** - **${dex.name.english}** - **${count}**`);
        pokemonCount++;
      }
    });

    const { content } = createPaginatedContent(msgArray, DEFAULT_PAGE_SIZE);

    const embed = createMonsterEmbed({
      title: ``,
      description: content.join('\n'),
      authorName: `Pokédex - Total Pokémon: ${pokemonCount}`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent PokeDex in ${interaction.guild?.name}!`);

  } catch (error) {
    logger.error(`Error in checkPokedex for user ${userId}:`, error);
    await queueMessage("An error occurred while fetching the Pokédex. Please try again.", interaction, false);
  }
}

/**
 * Enhanced favorites checker with improved error handling
 */
export async function checkFavorites(
  interaction: CommandInteraction,
  args: string[]
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const guildName = interaction.guild?.name;

  try {
    logger.debug(`Fetching Favorite Pokémon for ${interaction.user.tag} in ${guildName}..`);

    const splitMsg = args;
    const sortKey = [splitMsg[1], splitMsg[2]].filter(Boolean).join(' ');
    const filterType = splitMsg[splitMsg.length - 1];

    let pokemon = await getUsersFavoriteMonsters(userId);

    if (!pokemon || pokemon.length === 0) {
      await queueMessage(
        "You don't have any favorite monsters in your Pokédex. :( Use `!favorite ID` to add one.",
        interaction,
        false
      );
      return;
    }

    // Apply filters
    pokemon = filterMonsters(pokemon, filterType);

    logger.trace('Successfully fetched! Compiling..');

    // Process and sort monsters
    const processedMonsters = processMonsters(pokemon);
    const sortedMonsters = sortMonsters(processedMonsters, sortKey);

    // Handle pagination
    let currentPage = 0;
    const messages = sortedMonsters.map(monster => monster.msg);

    if (splitMsg.length >= 4 && !filterType.match(/legendary|mythical|ultrabeast|shiny|mega/i)) {
      const pageNum = parseInt(splitMsg[splitMsg.length - 1]);
      if (!isNaN(pageNum) && pageNum > 0) {
        currentPage = pageNum - 1;
      }
    }

    const { content } = createPaginatedContent(messages, DEFAULT_PAGE_SIZE, currentPage);

    // Create and send embed
    const embed = createMonsterEmbed({
      title: ``,
      description: content.join('\n'),
      authorName: `${username}'s Favorites\nShowing: ${format_number(content.length)}/${format_number(pokemon.length)}\nTotal: ${format_number(pokemon.length)}`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent favorites in ${guildName}!`);

  } catch (error) {
    logger.error(`Error in checkFavorites for user ${userId}:`, error);
    await queueMessage("An error occurred while fetching your favorites. Please try again.", interaction, false);
  }
}

/**
 * Enhanced search function with improved matching and error handling
 */
export async function searchMonsters(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const guildName = interaction.guild?.name;

  try {
    const searchTerm = interaction.options
      .get("pokemon")?.value?.toString()
      ?.toLowerCase()
      ?.replace(/ {2,}/g, " ")
      ?.trim();

    if (!searchTerm) {
      await queueMessage("Please provide a Pokémon name to search for.", interaction, false);
      return;
    }

    const pokemon = await getUsersMonsters(userId);

    if (!pokemon || pokemon.length === 0) {
      await queueMessage("You don't have any monsters in your Pokédex. :(", interaction, false);
      return;
    }

    // Filter monsters by search term
    const matchedMonsters = pokemon.filter(monster => {
      const dexEntry = findMonsterByIDLocal(monster.monster_id);
      if (!dexEntry) return false;

      const cleanName = dexEntry.name.english.toLowerCase().replace(/♂|♀/g, "");
      return cleanName === searchTerm;
    });

    if (matchedMonsters.length === 0) {
      await queueMessage(`Cannot find '${searchTerm}'.`, interaction, false);
      return;
    }

    // Process and sort by IV (high to low) by default
    const processedMonsters = processMonsters(matchedMonsters);
    const sortedMonsters = sortMonsters(processedMonsters, 'iv high');

    // Create content
    const messages = sortedMonsters.map(monster =>
      monster.msg.replace('Level', 'LVL').replace('Avg IV', 'IV')
    );

    const { content } = createPaginatedContent(messages, SEARCH_PAGE_SIZE);

    // Create embed
    const embed = createMonsterEmbed({
      title: ``,
      description: content.join('\n'),
      authorName: `${username}'s search for '${searchTerm}' - Total: ${format_number(matchedMonsters.length)}/${format_number(pokemon.length)}${content.length !== matchedMonsters.length ? ` - Pages: ${Math.ceil(matchedMonsters.length / SEARCH_PAGE_SIZE)}` : ''}`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`
    });

    await sendEmbedResponse(interaction, embed, true);
    logger.debug(`Sent Pokémon search results for ${username} in ${guildName}!`);

  } catch (error) {
    logger.error(`Error in searchMonsters for user ${userId}:`, error);
    await queueMessage("An error occurred while searching. Please try again.", interaction, false);
  }
}

// ============================================================================
// UTILITY FUNCTIONS (Additional exports for testing and debugging)
// ============================================================================

/**
 * Export for testing - calculates average IV
 */
export function calculateMonsterIV(monster: IMonsterModel): number {
  return calculateAverageIV(monster);
}

/**
 * Export for testing - processes a single monster
 */
export function processSingleMonster(monster: IMonsterModel, currentMonsterId?: number): ProcessedMonster | null {
  const processed = processMonsters([monster], currentMonsterId);
  return processed[0] || null;
}

/**
 * Export for testing - sorts monsters array
 */
export function sortMonstersArray(monsters: ProcessedMonster[], sortType: string): ProcessedMonster[] {
  return sortMonsters(monsters, sortType);
}

/**
 * Export for testing - applies filters
 */
export function applyMonsterFilters(monsters: IMonsterModel[], filterType: string): IMonsterModel[] {
  return filterMonsters(monsters, filterType);
}

/**
 * Export for testing - creates paginated content
 */
export function createPagination(
  messages: string[],
  pageSize: number = DEFAULT_PAGE_SIZE,
  currentPage: number = 0
) {
  return createPaginatedContent(messages, pageSize, currentPage);
}