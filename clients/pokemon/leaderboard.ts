import { ChatInputCommandInteraction, EmbedBuilder, User } from 'discord.js';
import { databaseClient } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { MonsterTable, type IMonsterModel } from '../../models/Monster';
import { format_number } from '../../utils';
import { queueMessage } from '../message_queue';
import {
    calculateIVPercentage,
    findMonsterByID,
    formatPokemonTypes,
    getPokemonDisplayName,
    getPokemonRarity,
    getPokemonSpecies,
    getPokemonWithEnglishName,
    isPokemonLegendary,
    searchPokemonByName,
    type Pokemon
} from './monsters';

const logger = getLogger('Pokémon-Leaderboard');

// Constants for better maintainability
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 15;
const BATCH_SIZE = 10;
const API_REQUEST_DELAY = 50;

// interfaces for better type safety
interface LeaderboardOptions {
  type: string;
  sort: string;
  search?: string;
  filter?: string;
  user?: string;
  limit: number;
  page: number;
  minLevel?: number;
  maxLevel?: number;
  minIV?: number;
  maxIV?: number;
}

interface ProcessedLeaderboardEntry {
  id: number;
  name: string;
  displayName: string;
  shiny: boolean;
  legendary: boolean;
  mythical: boolean;
  level: number;
  iv: number;
  owner: string;
  msg: string;
  raw: IMonsterModel;
  pokemonData?: Pokemon;
  types?: string[];
  rarity?: string;
}

interface LeaderboardResult {
  entries: ProcessedLeaderboardEntry[];
  totalCount: number;
  pageInfo: string;
  searchInfo: string;
}

// Enums for better type safety
enum SortType {
  IV = 'iv',
  HP = 'hp',
  ATTACK = 'attack',
  DEFENSE = 'defense',
  SP_ATTACK = 'sp_attack',
  SP_DEFENSE = 'sp_defense',
  SPEED = 'speed',
  LEVEL = 'level',
  ID = 'id',
  NAME = 'name',
}

enum SortDirection {
  HIGH = 'high',
  LOW = 'low',
  DESC = 'desc',
  ASC = 'asc',
}

enum FilterType {
  SHINY = 'shiny',
  LEGENDARY = 'legendary',
  MYTHICAL = 'mythical',
  TYPE = 'type',
  GENERATION = 'generation',
  USER = 'user',
  RARITY = 'rarity',
}

/**
 * leaderboard function with comprehensive search options
 */
export async function checkLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const options = parseLeaderboardOptions(interaction);

    logger.debug(`Fetching leaderboard with options:`, options);

    // Show loading message for complex queries
    if (options.search || options.filter || options.limit > 50) {
      await queueMessage(
        "🔍 Searching leaderboard... This may take a moment for complex queries.",
        interaction,
        true
      );
    }

    const result = await getLeaderboardData(options);

    if (!result.entries.length) {
      await queueMessage(
        "No Pokémon found matching your criteria. Try adjusting your search parameters.",
        interaction,
        false
      );
      return;
    }

    const embed = await createLeaderboardEmbed(result, options, interaction.user);
    await interaction.channel?.send({ embeds: [embed] });

    logger.debug(`Successfully sent leaderboard with ${result.entries.length} entries`);
  } catch (error) {
    logger.error('Error in checkLeaderboard:', error);
    await queueMessage(
      "An error occurred while fetching the leaderboard. Please try again.",
      interaction,
      false
    );
  }
}

/**
 * Parse leaderboard options from interaction
 */
function parseLeaderboardOptions(interaction: ChatInputCommandInteraction): LeaderboardOptions {
  const input = interaction.options.get('input')?.value?.toString() || 'iv high';
  const args = input.toLowerCase().split(' ').filter(Boolean);

  const options: LeaderboardOptions = {
    type: SortType.IV,
    sort: SortDirection.HIGH,
    limit: DEFAULT_LIMIT,
    page: 1,
  };

  // Parse basic type and sort
  if (args.length >= 1) {
    options.type = args[0];
  }
  if (args.length >= 2) {
    options.sort = args[1];
  }

  // Parse advanced options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case 'limit':
      case 'top':
        if (args[i + 1] && !isNaN(parseInt(args[i + 1]))) {
          options.limit = Math.min(parseInt(args[i + 1]), MAX_LIMIT);
          i++;
        }
        break;

      case 'page':
        if (args[i + 1] && !isNaN(parseInt(args[i + 1]))) {
          options.page = Math.max(1, parseInt(args[i + 1]));
          i++;
        }
        break;

      case 'user':
      case 'owner':
        if (args[i + 1]) {
          options.user = args[i + 1].replace(/[<@!>]/g, ''); // Clean user ID
          i++;
        }
        break;

      case 'filter':
        if (args[i + 1]) {
          options.filter = args[i + 1];
          i++;
        }
        break;

      case 'minlevel':
        if (args[i + 1] && !isNaN(parseInt(args[i + 1]))) {
          options.minLevel = parseInt(args[i + 1]);
          i++;
        }
        break;

      case 'maxlevel':
        if (args[i + 1] && !isNaN(parseInt(args[i + 1]))) {
          options.maxLevel = parseInt(args[i + 1]);
          i++;
        }
        break;

      case 'miniv':
        if (args[i + 1] && !isNaN(parseFloat(args[i + 1]))) {
          options.minIV = parseFloat(args[i + 1]);
          i++;
        }
        break;

      case 'maxiv':
        if (args[i + 1] && !isNaN(parseFloat(args[i + 1]))) {
          options.maxIV = parseFloat(args[i + 1]);
          i++;
        }
        break;

      case 'search':
      case 'pokemon':
        if (args[i + 1]) {
          // Collect all remaining args as search term
          options.search = args.slice(i + 1).join(' ');
          return options; // Exit early since rest is search term
        }
        break;
    }
  }

  return options;
}

/**
 * Get leaderboard data with advanced filtering and searching
 */
async function getLeaderboardData(options: LeaderboardOptions): Promise<LeaderboardResult> {
  try {
    // Build base query
    let query = databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where('released', 0); // Only non-released Pokemon

    // Apply user filter
    if (options.user) {
      query = query.where('uid', options.user);
    }

    // Apply level filters
    if (options.minLevel !== undefined) {
      query = query.where('level', '>=', options.minLevel);
    }
    if (options.maxLevel !== undefined) {
      query = query.where('level', '<=', options.maxLevel);
    }

    // Apply IV filters
    if (options.minIV !== undefined) {
      query = query.where('avg_iv', '>=', options.minIV);
    }
    if (options.maxIV !== undefined) {
      query = query.where('avg_iv', '<=', options.maxIV);
    }

    // Apply Pokemon-specific search
    if (options.search) {
      const searchResults = await searchPokemonByName(options.search, 10);
      if (searchResults.length > 0) {
        const pokemonIds = searchResults.map(p => p.id);
        query = query.whereIn('monster_id', pokemonIds);
      } else {
        // If no Pokemon found, return empty result
        return {
          entries: [],
          totalCount: 0,
          pageInfo: '',
          searchInfo: `No Pokémon found matching "${options.search}"`
        };
      }
    }

    // Apply sorting
    const { orderBy, direction } = getSortingParams(options.type, options.sort);
    query = query.orderBy(orderBy, direction);

    // Get total count for pagination
    const countQuery = query.clone();
    const totalCount = await countQuery.count('* as count').first();
    const total = totalCount || 0;

    // Apply pagination
    const offset = (options.page - 1) * options.limit;
    query = query.limit(options.limit).offset(offset);

    const monsters = await query;

    if (!monsters.length) {
      return {
        entries: [],
        totalCount: total as number,
        pageInfo: '',
        searchInfo: 'No Pokémon found matching criteria'
      };
    }

    // Process monsters with Pokemon data
    const processedEntries = await processLeaderboardEntries(monsters, options);

    // Apply post-query filters (for filters that require Pokemon API data)
    const filteredEntries = await applyAdvancedFilters(processedEntries, options);

    // Create pagination info
    const totalPages = Math.ceil((total as number) / options.limit);
    const pageInfo = totalPages > 1
      ? `Page ${options.page}/${totalPages} (${filteredEntries.length}/${total} total)`
      : `${filteredEntries.length} total`;

    // Create search info
    const searchInfo = createSearchInfo(options);

    return {
      entries: filteredEntries,
      totalCount: total as number,
      pageInfo,
      searchInfo
    };
  } catch (error) {
    logger.error('Error getting leaderboard data:', error);
    throw error;
  }
}

/**
 * Get sorting parameters for database query
 */
function getSortingParams(type: string, sort: string): { orderBy: string; direction: 'asc' | 'desc' } {
  const direction = (sort === 'low' || sort === 'asc') ? 'asc' : 'desc';

  let orderBy: string;
  switch (type) {
    case 'iv':
    case 'stats':
    case 'average':
      orderBy = 'avg_iv';
      break;
    case 'hp':
      orderBy = 'hp';
      break;
    case 'attack':
      orderBy = 'attack';
      break;
    case 'defense':
      orderBy = 'defense';
      break;
    case 'sp_attack':
    case 'spatk':
      orderBy = 'sp_attack';
      break;
    case 'sp_defense':
    case 'spdef':
      orderBy = 'sp_defense';
      break;
    case 'speed':
      orderBy = 'speed';
      break;
    case 'level':
      orderBy = 'level';
      break;
    case 'id':
      orderBy = 'id';
      break;
    default:
      orderBy = 'avg_iv';
  }

  return { orderBy, direction };
}

/**
 * Process monsters into leaderboard entries with Pokemon data
 */
async function processLeaderboardEntries(
  monsters: IMonsterModel[],
  options: LeaderboardOptions
): Promise<ProcessedLeaderboardEntry[]> {
  const processedEntries: ProcessedLeaderboardEntry[] = [];

  // Process in batches to manage API calls
  for (let i = 0; i < monsters.length; i += BATCH_SIZE) {
    const batch = monsters.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (monster) => {
      try {
        const [pokemonData, pokemonWithName] = await Promise.all([
          findMonsterByID(monster.monster_id),
          findMonsterByID(monster.monster_id).then(p => p ? getPokemonWithEnglishName(p) : null)
        ]);

        if (!pokemonData) {
          logger.warn(`Pokemon not found for monster ID: ${monster.monster_id}`);
          return null;
        }

        // Get Pokemon properties
        const displayName = pokemonWithName?.englishName || getPokemonDisplayName(pokemonData);
        const types = formatPokemonTypes(pokemonData.types);
        const iv = calculateIVPercentage({
          hp: monster.hp,
          attack: monster.attack,
          defense: monster.defense,
          sp_attack: monster.sp_attack,
          sp_defense: monster.sp_defense,
          speed: monster.speed,
        });

        // Check for special properties
        const [isLegendary, species] = await Promise.all([
          isPokemonLegendary(pokemonData),
          getPokemonSpecies(monster.monster_id).catch(() => null)
        ]);

        const isMythical = species?.is_mythical || false;
        const rarity = await getPokemonRarity(pokemonData).catch(() => ({ category: 'Common' }));

        // Format message
        const shinyIcon = monster.shiny ? ' ⭐' : '';
        const legendaryIcon = (isLegendary || isMythical) ? ' 💠' : '';
        const typeString = types.length > 0 ? ` (${types.join('/')})` : '';

        const msg = `**${monster.id}** - **${displayName}**${shinyIcon}${legendaryIcon}${typeString} - **Level ${monster.level}** - **IV ${iv}%** - Owner: <@${monster.uid}>`;

        return {
          id: monster.id,
          name: pokemonData.name,
          displayName,
          shiny: Boolean(monster.shiny),
          legendary: isLegendary,
          mythical: isMythical,
          level: monster.level,
          iv,
          owner: monster.uid,
          msg,
          raw: monster,
          pokemonData,
          types,
          rarity: rarity.category,
        };
      } catch (error) {
        logger.error(`Error processing monster ${monster.id}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    processedEntries.push(...(batchResults.filter(Boolean) as ProcessedLeaderboardEntry[]));

    // Add delay between batches
    if (i + BATCH_SIZE < monsters.length) {
      await new Promise(resolve => setTimeout(resolve, API_REQUEST_DELAY));
    }
  }

  return processedEntries;
}

/**
 * Apply advanced filters that require Pokemon API data
 */
async function applyAdvancedFilters(
  entries: ProcessedLeaderboardEntry[],
  options: LeaderboardOptions
): Promise<ProcessedLeaderboardEntry[]> {
  if (!options.filter) {
    return entries;
  }

  const filter = options.filter.toLowerCase();

  return entries.filter(entry => {
    switch (filter) {
      case FilterType.SHINY:
        return entry.shiny;
      case FilterType.LEGENDARY:
        return entry.legendary;
      case FilterType.MYTHICAL:
        return entry.mythical;
      case 'normal':
        return !entry.legendary && !entry.mythical && !entry.shiny;
      case 'special':
        return entry.legendary || entry.mythical || entry.shiny;
      default:
        // Check if filter matches type
        if (entry.types?.some(type => type.toLowerCase().includes(filter))) {
          return true;
        }
        // Check if filter matches rarity
        if (entry.rarity?.toLowerCase().includes(filter)) {
          return true;
        }
        return true; // Default to include if filter not recognized
    }
  });
}

/**
 * Create search info string for display
 */
function createSearchInfo(options: LeaderboardOptions): string {
  const info: string[] = [];

  if (options.search) {
    info.push(`Search: "${options.search}"`);
  }
  if (options.filter) {
    info.push(`Filter: ${options.filter}`);
  }
  if (options.user) {
    info.push(`User: <@${options.user}>`);
  }
  if (options.minLevel !== undefined || options.maxLevel !== undefined) {
    const min = options.minLevel || 1;
    const max = options.maxLevel || 100;
    info.push(`Level: ${min}-${max}`);
  }
  if (options.minIV !== undefined || options.maxIV !== undefined) {
    const min = options.minIV || 0;
    const max = options.maxIV || 100;
    info.push(`IV: ${min}%-${max}%`);
  }

  return info.length > 0 ? info.join(' | ') : 'All Pokémon';
}

/**
 * Create leaderboard embed with formatting
 */
async function createLeaderboardEmbed(
  result: LeaderboardResult,
  options: LeaderboardOptions,
  user: User
): Promise<EmbedBuilder> {
  const sortTypeDisplay = options.type.toUpperCase();
  const sortDirDisplay = options.sort.toUpperCase();

  const title = `🏆 Top ${result.entries.length} Pokémon - ${sortTypeDisplay} (${sortDirDisplay})`;

  const description = result.entries.map((entry, index) => {
    const rank = ((options.page - 1) * options.limit) + index + 1;
    return `**${rank}.** ${entry.msg}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x3498DB)
    .setTimestamp()
    .setFooter({
      text: `${result.pageInfo} | ${result.searchInfo}`,
      iconURL: user.avatarURL() || undefined
    });

  return embed;
}

/**
 * Get user leaderboard (top Pokemon for a specific user)
 */
export async function getUserLeaderboard(
  interaction: ChatInputCommandInteraction,
  userId: string,
  type: string = 'iv',
  sort: string = 'high',
  limit: number = 10
): Promise<void> {
  try {
    const options: LeaderboardOptions = {
      type,
      sort,
      user: userId,
      limit: Math.min(limit, 50),
      page: 1,
    };

    const result = await getLeaderboardData(options);

    if (!result.entries.length) {
      await queueMessage("This user has no Pokémon or none matching the criteria.", interaction, false);
      return;
    }

    const embed = await createLeaderboardEmbed(result, options, interaction.user);
    embed.setTitle(`🏆 ${interaction.user.username}'s Top ${result.entries.length} Pokémon`);

    await interaction.channel?.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Error in getUserLeaderboard:', error);
    await queueMessage("An error occurred while fetching the user leaderboard.", interaction, false);
  }
}

/**
 * Get type-specific leaderboard
 */
export async function getTypeLeaderboard(
  interaction: ChatInputCommandInteraction,
  pokemonType: string,
  sort: string = 'iv high',
  limit: number = 25
): Promise<void> {
  try {
    const options: LeaderboardOptions = {
      type: 'iv',
      sort: 'high',
      filter: pokemonType.toLowerCase(),
      limit: Math.min(limit, MAX_LIMIT),
      page: 1,
    };

    const result = await getLeaderboardData(options);

    if (!result.entries.length) {
      await queueMessage(`No ${pokemonType} type Pokémon found.`, interaction, false);
      return;
    }

    const embed = await createLeaderboardEmbed(result, options, interaction.user);
    embed.setTitle(`🏆 Top ${result.entries.length} ${pokemonType.charAt(0).toUpperCase() + pokemonType.slice(1)} Type Pokémon`);

    await interaction.channel?.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Error in getTypeLeaderboard:', error);
    await queueMessage("An error occurred while fetching the type leaderboard.", interaction, false);
  }
}

/**
 * Get comprehensive leaderboard statistics
 */
export async function getLeaderboardStats(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const [totalPokemon, shinyCount, legendaryCount, maxLevelCount] = await Promise.all([
      databaseClient<IMonsterModel>(MonsterTable).count('* as count').where('released', 0).first(),
      databaseClient<IMonsterModel>(MonsterTable).count('* as count').where({ released: 0, shiny: 1 }).first(),
      databaseClient<IMonsterModel>(MonsterTable).select().where('released', 0).then(async monsters => {
        let legendary = 0;
        for (const monster of monsters.slice(0, 100)) { // Sample to avoid API overload
          try {
            const pokemon = await findMonsterByID(monster.monster_id);
            if (pokemon && await isPokemonLegendary(pokemon)) {
              legendary++;
            }
          } catch (error) {
            // Continue counting
          }
        }
        return legendary;
      }),
      databaseClient<IMonsterModel>(MonsterTable).count('* as count').where({ released: 0, level: 100 }).first(),
    ]);

    const embed = new EmbedBuilder()
      .setTitle('📊 Leaderboard Statistics')
      .addFields(
        { name: 'Total Pokémon', value: format_number(totalPokemon || 0), inline: true },
        { name: 'Shiny Pokémon', value: format_number(shinyCount || 0), inline: true },
        { name: 'Max Level (100)', value: format_number(maxLevelCount || 0), inline: true },
        { name: 'Legendary (sample)', value: format_number(legendaryCount || 0), inline: true },
      )
      .setColor(0x9B59B6)
      .setTimestamp();

    await interaction.channel?.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Error in getLeaderboardStats:', error);
    await queueMessage("An error occurred while fetching leaderboard statistics.", interaction, false);
  }
}

/**
 * Show leaderboard help with all available options
 */
export async function showLeaderboardHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('🏆 Leaderboard Help')
    .setDescription('Advanced leaderboard search and filtering options')
    .addFields(
      {
        name: '📋 Basic Usage',
        value: '`/leaderboard [type] [direction] [options]`\n' +
          'Examples:\n' +
          '• `/leaderboard iv high`\n' +
          '• `/leaderboard level low limit 10`\n' +
          '• `/leaderboard attack high filter shiny`',
        inline: false
      },
      {
        name: '📊 Sort Types',
        value: '• `iv` - Average IV percentage\n' +
          '• `hp`, `attack`, `defense` - Individual stats\n' +
          '• `sp_attack`, `sp_defense`, `speed` - Special stats\n' +
          '• `level` - Pokémon level\n' +
          '• `id` - Database ID',
        inline: true
      },
      {
        name: '🔽 Sort Direction',
        value: '• `high`/`desc` - Highest first\n' +
          '• `low`/`asc` - Lowest first',
        inline: true
      },
      {
        name: '🔍 Search Options',
        value: '• `search <pokemon>` - Find specific Pokémon\n' +
          '• `user <@user>` - User\'s Pokémon only\n' +
          '• `filter <type>` - Filter by criteria\n' +
          '• `limit <number>` - Results limit (max 100)\n' +
          '• `page <number>` - Page number',
        inline: false
      },
      {
        name: '🎯 Filters',
        value: '• `shiny` - Shiny Pokémon only\n' +
          '• `legendary` - Legendary Pokémon\n' +
          '• `mythical` - Mythical Pokémon\n' +
          '• `fire`, `water`, etc. - By type\n' +
          '• `common`, `rare`, etc. - By rarity',
        inline: true
      },
      {
        name: '📏 Range Filters',
        value: '• `minlevel <num>` - Minimum level\n' +
          '• `maxlevel <num>` - Maximum level\n' +
          '• `miniv <num>` - Minimum IV%\n' +
          '• `maxiv <num>` - Maximum IV%',
        inline: true
      },
      {
        name: '💡 Example Commands',
        value: '```\n' +
          '/leaderboard iv high filter shiny limit 10\n' +
          '/leaderboard level high user @john miniv 90\n' +
          '/leaderboard attack high search pikachu\n' +
          '/leaderboard speed low filter fire minlevel 50\n' +
          '```',
        inline: false
      }
    )
    .setColor(0x3498DB)
    .setTimestamp();

  await interaction.channel?.send({ embeds: [embed] });
}

// Export utility functions for testing and external use
export {
    applyAdvancedFilters,
    createSearchInfo, FilterType, getSortingParams, parseLeaderboardOptions, processLeaderboardEntries, SortDirection, SortType, type LeaderboardOptions, type LeaderboardResult, type ProcessedLeaderboardEntry
};

