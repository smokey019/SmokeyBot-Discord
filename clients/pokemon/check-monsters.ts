import { CommandInteraction, EmbedBuilder } from "discord.js";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import type { IMonsterUserModel } from "../../models/MonsterUser";
import { chunk, format_number } from "../../utils";
import { queueMessage } from "../message_queue";
import { userDex } from "./info";
import {
  findMonsterByIDAPI,
  getPokemonSpecies,
  getUsersFavoriteMonsters,
  getUsersMonsters,
  type Pokemon,
} from "./monsters";

const logger = getLogger("Pokémon");

// Constants for better maintainability
const MAX_EMBED_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 10;
const MAX_IV_TOTAL = 186; // 31 * 6 stats
const TRIM_SUFFIX = "...";
const API_REQUEST_DELAY = 100; // Delay between API requests to avoid rate limits
const BATCH_SIZE = 5; // Number of Pokemon to process simultaneously

// Error handling
class CheckMonstersError extends Error {
  constructor(message: string, public code: string, public userId?: string) {
    super(message);
    this.name = "CheckMonstersError";
  }
}

// Enums for better type safety and consistency
enum SortType {
  IV_HIGH = "iv_high",
  IV_LOW = "iv_low",
  LEVEL_HIGH = "level_high",
  LEVEL_LOW = "level_low",
  ID_HIGH = "id_high",
  ID_LOW = "id_low",
  SHINY_HIGH = "shiny_high",
  SHINY_LOW = "shiny_low",
  NAME_HIGH = "name_high",
  NAME_LOW = "name_low",
}

enum FilterType {
  LEGENDARY = "legendary",
  MYTHICAL = "mythical",
  ULTRABEAST = "ultrabeast",
  SHINY = "shiny",
  MEGA = "mega",
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
  pokemonData?: Pokemon;
}

interface EmbedOptions {
  title: string;
  description: string;
  authorName: string;
  authorIcon?: string;
  authorUrl?: string;
  footer?: string;
}

// Cache for processed monster data to avoid repeated API calls
const monsterDataCache = new Map<
  number,
  { pokemon: Pokemon; species: any; timestamp: number }
>();
const MONSTER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Get Pokemon display name from API data
 * @param pokemon - Pokemon API data
 * @returns Pokemon display name
 */
function getPokemonDisplayName(pokemon: Pokemon): string {
  if (!pokemon.name) return "Unknown Pokemon";

  // Convert API name to display format
  return pokemon.name
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get Pokemon with species data and determine special status
 * @param pokemonId - Pokemon ID
 * @returns Combined Pokemon and species data
 */
async function getPokemonWithSpecies(
  pokemonId: number
): Promise<{ pokemon: Pokemon; species: any; special?: string } | null> {
  const cacheKey = pokemonId;
  const cached = monsterDataCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < MONSTER_CACHE_TTL) {
    return {
      pokemon: cached.pokemon,
      species: cached.species,
      special: getSpecialStatus(cached.species),
    };
  }

  try {
    const [pokemon, species] = await Promise.all([
      findMonsterByIDAPI(pokemonId),
      getPokemonSpecies(pokemonId),
    ]);

    if (!pokemon) {
      logger.warn(`Pokemon not found for ID: ${pokemonId}`);
      return null;
    }

    // Cache the result
    monsterDataCache.set(cacheKey, {
      pokemon,
      species: species || null,
      timestamp: Date.now(),
    });

    const special = getSpecialStatus(species);
    return { pokemon, species, special };
  } catch (error) {
    logger.error(`Error fetching Pokemon data for ID ${pokemonId}:`, error);
    return null;
  }
}

/**
 * Determine special status from species data
 * @param species - Pokemon species data
 * @returns Special status string or undefined
 */
function getSpecialStatus(species: any): string | undefined {
  if (!species) return undefined;

  if (species.is_legendary) return "Legendary";
  if (species.is_mythical) return "Mythical";

  // Check for Ultra Beasts (they're in Alola region and have specific characteristics)
  if (
    species.generation?.name === "generation-vii" &&
    species.habitat === null
  ) {
    return "Ultrabeast";
  }

  return undefined;
}

/**
 * Get Pokemon English name from species data
 * @param species - Pokemon species data
 * @returns English name or fallback name
 */
function getPokemonEnglishName(species: any, fallbackName: string): string {
  if (!species?.names) return fallbackName;

  const englishName = species.names.find(
    (name: any) => name.language.name === "en"
  );
  return englishName?.name || fallbackName;
}

/**
 * Check if Pokemon is a Mega form
 * @param pokemon - Pokemon API data
 * @returns boolean indicating if it's a Mega form
 */
function isMegaForm(pokemon: Pokemon): boolean {
  return (
    pokemon.name.includes("mega") ||
    pokemon.forms.some((form) => form.name.includes("mega"))
  );
}

/**
 * Calculates average IV percentage from individual IV values
 */
function calculateAverageIV(monster: IMonsterModel): number {
  const totalIV =
    monster.hp +
    monster.attack +
    monster.defense +
    monster.sp_attack +
    monster.sp_defense +
    monster.speed;
  return parseFloat(((totalIV / MAX_IV_TOTAL) * 100).toFixed(2));
}

/**
 * Generates display icons for monster properties
 */
function getMonsterIcons(
  monster: IMonsterModel,
  special?: string
): {
  shiny: string;
  favorite: string;
  legendary: string;
} {
  return {
    shiny: monster.shiny ? " ⭐" : "",
    favorite: monster.favorite ? " 💟" : "",
    legendary: special ? " 💠" : "",
  };
}

/**
 * Formats a monster entry for display
 */
function formatMonsterEntry(
  monster: IMonsterModel,
  pokemon: Pokemon,
  special?: string,
  englishName?: string,
  isCurrentMonster: boolean = false
): string {
  const icons = getMonsterIcons(monster, special);
  const averageIV = calculateAverageIV(monster);
  const displayName = englishName || getPokemonDisplayName(pokemon);

  const baseText = `**${monster.id}** - **${displayName}${icons.shiny}${icons.favorite}${icons.legendary}** - **Level ${monster.level}** - **Avg IV ${averageIV}%**`;

  return isCurrentMonster ? `__${baseText}__` : baseText;
}

/**
 * Enhanced sorting function with proper type handling
 */
function sortMonsters(
  monsters: ProcessedMonster[],
  sortType: string
): ProcessedMonster[] {
  const sortFunctions: Record<
    string,
    (a: ProcessedMonster, b: ProcessedMonster) => number
  > = {
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
    "iv high": (a, b) => b.iv - a.iv,
    "iv low": (a, b) => a.iv - b.iv,
    "level high": (a, b) => b.level - a.level,
    "level low": (a, b) => a.level - b.level,
    "id high": (a, b) => b.id - a.id,
    "id low": (a, b) => a.id - b.id,
    "shiny +": (a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0),
    "shiny -": (a, b) => (a.shiny ? 1 : 0) - (b.shiny ? 1 : 0),
    "name desc": (a, b) => b.name.localeCompare(a.name),
    "name asc": (a, b) => a.name.localeCompare(b.name),
  };

  const sortFunction =
    sortFunctions[sortType] || sortFunctions[SortType.ID_HIGH];
  return [...monsters].sort(sortFunction);
}

/**
 * Applies filters to monster list using PokeAPI data
 */
async function filterMonsters(
  monsters: IMonsterModel[],
  filterType: string
): Promise<IMonsterModel[]> {
  if (!filterType) return monsters;

  const filteredMonsters: IMonsterModel[] = [];

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < monsters.length; i += BATCH_SIZE) {
    const batch = monsters.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (monster) => {
      try {
        const pokemonData = await getPokemonWithSpecies(monster.monster_id);
        if (!pokemonData) return null;

        const { pokemon, special } = pokemonData;
        let shouldInclude = false;

        switch (filterType.toLowerCase()) {
          case FilterType.LEGENDARY:
            shouldInclude = special === "Legendary";
            break;
          case FilterType.MYTHICAL:
            shouldInclude = special === "Mythical";
            break;
          case FilterType.ULTRABEAST:
            shouldInclude = special === "Ultrabeast";
            break;
          case FilterType.SHINY:
            shouldInclude = Boolean(monster.shiny);
            break;
          case FilterType.MEGA:
            shouldInclude = isMegaForm(pokemon);
            break;
          default:
            shouldInclude = true;
        }

        return shouldInclude ? monster : null;
      } catch (error) {
        logger.error(`Error filtering monster ${monster.id}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    filteredMonsters.push(...(batchResults.filter(Boolean) as IMonsterModel[]));

    // Add delay between batches
    if (i + BATCH_SIZE < monsters.length) {
      await new Promise((resolve) => setTimeout(resolve, API_REQUEST_DELAY));
    }
  }

  return filteredMonsters;
}

/**
 * Processes monsters into display format using PokeAPI
 */
async function processMonsters(
  monsters: IMonsterModel[],
  currentMonsterId?: number
): Promise<ProcessedMonster[]> {
  const processed: ProcessedMonster[] = [];

  // Process in batches to manage API rate limits
  for (let i = 0; i < monsters.length; i += BATCH_SIZE) {
    const batch = monsters.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (monster) => {
      try {
        const pokemonData = await getPokemonWithSpecies(monster.monster_id);
        if (!pokemonData) {
          logger.warn(
            `Pokemon data not found for monster ID: ${monster.monster_id}`
          );
          return null;
        }

        const { pokemon, species, special } = pokemonData;
        const englishName = getPokemonEnglishName(
          species,
          getPokemonDisplayName(pokemon)
        );
        const isCurrentMonster = currentMonsterId === monster.id;
        const averageIV = calculateAverageIV(monster);

        const formattedMessage = formatMonsterEntry(
          monster,
          pokemon,
          special,
          englishName,
          isCurrentMonster
        );

        return {
          id: monster.id,
          name: englishName,
          shiny: monster.shiny ? " ⭐" : "",
          level: monster.level,
          iv: averageIV,
          msg: formattedMessage,
          favorite: Boolean(monster.favorite),
          special,
          raw: monster,
          pokemonData: pokemon,
        };
      } catch (error) {
        logger.error(`Error processing monster ${monster.id}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    processed.push(...(batchResults.filter(Boolean) as ProcessedMonster[]));

    // Add delay between batches
    if (i + BATCH_SIZE < monsters.length) {
      await new Promise((resolve) => setTimeout(resolve, API_REQUEST_DELAY));
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
  const pageInfo =
    totalPages > 1
      ? `Page: **${currentPage + 1}/${format_number(totalPages)}**`
      : "";

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
  const embed = new EmbedBuilder().setDescription(
    ensureMessageLength(options.description)
  );

  if (options.authorName) {
    embed.setAuthor({
      name: options.authorName,
      iconURL: options.authorIcon,
      url: options.authorUrl,
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
    logger.error("Failed to send embed response:", error);

    // Fallback to simple text response
    try {
      const fallbackMessage =
        "Error displaying Pokémon list. Please try again.";
      if (isReply) {
        await queueMessage(fallbackMessage, interaction, false);
      } else {
        await interaction.channel?.send(fallbackMessage);
      }
    } catch (fallbackError) {
      logger.error("Failed to send fallback response:", fallbackError);
    }
  }
}

/**
 * Enhanced version of checkMonstersNew with PokeAPI integration
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
    const sortOption =
      interaction.options.get("options")?.value?.toString() || SortType.ID_HIGH;

    logger.debug("Successfully fetched! Compiling..");

    // Show loading message for large collections
    if (pokemon.length > 20) {
      await queueMessage(
        "Processing your Pokémon collection... This may take a moment.",
        interaction,
        true
      );
    }

    // Get current monster for highlighting
    const user: IMonsterUserModel = await getUser(userId);
    const currentMonster = user?.current_monster
      ? await databaseClient<IMonsterModel>(MonsterTable)
          .first()
          .where("id", user.current_monster)
      : null;

    // Process and sort monsters
    const processedMonsters = await processMonsters(
      pokemon,
      currentMonster?.id
    );
    const sortedMonsters = sortMonsters(processedMonsters, sortOption);

    // Create paginated content
    const messages = sortedMonsters.map((monster) => monster.msg);
    const { content } = createPaginatedContent(
      messages,
      DEFAULT_PAGE_SIZE,
      0,
      pokemon.length
    );

    // Create and send embed
    const embed = createMonsterEmbed({
      title: `${username}'s Pokémon\n\nShowing: ${format_number(
        content.length
      )}/${format_number(pokemon.length)}`,
      description: content.join("\n"),
      authorName: "User Profile",
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`,
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent Pokémon for ${interaction.user.tag} in ${guildName}!`);
  } catch (error) {
    logger.error(`Error in checkMonstersNew for user ${userId}:`, error);
    await queueMessage(
      "An error occurred while fetching your Pokémon. Please try again.",
      interaction,
      true
    );
  }
}

/**
 * Enhanced version of checkMonsters with PokeAPI integration
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
    const sortKey = [splitMsg[1], splitMsg[2]].filter(Boolean).join(" ");
    const filterType = splitMsg[splitMsg.length - 1];

    let pokemon = await getUsersMonsters(userId);

    if (!pokemon || pokemon.length === 0) {
      await queueMessage(
        "You don't have any monsters in your Pokédex. :(",
        interaction,
        false
      );
      return;
    }

    // Apply filters
    if (
      filterType &&
      filterType.match(/legendary|mythical|ultrabeast|shiny|mega/i)
    ) {
      await interaction.channel?.send(
        "Applying filters... This may take a moment."
      );
      pokemon = await filterMonsters(pokemon, filterType);
    }

    logger.debug("Successfully fetched! Compiling..");

    // Show loading message for large collections
    if (pokemon.length > 20) {
      await interaction.channel?.send(
        "Processing your Pokémon collection... This may take a moment."
      );
    }

    // Get current monster
    const user: IMonsterUserModel = await getUser(userId);
    const currentMonster = user?.current_monster
      ? await databaseClient<IMonsterModel>(MonsterTable)
          .first()
          .where("id", user.current_monster)
      : null;

    // Process and sort monsters
    const processedMonsters = await processMonsters(
      pokemon,
      currentMonster?.id
    );
    const sortedMonsters = sortMonsters(processedMonsters, sortKey);

    // Handle pagination
    let currentPage = 0;
    const messages = sortedMonsters.map((monster) => monster.msg);

    if (
      splitMsg.length >= 4 &&
      !filterType.match(/legendary|mythical|ultrabeast|shiny|mega/i)
    ) {
      const pageNum = parseInt(splitMsg[splitMsg.length - 1]);
      if (!isNaN(pageNum) && pageNum > 0) {
        currentPage = pageNum - 1;
      }
    }

    const { content } = createPaginatedContent(
      messages,
      DEFAULT_PAGE_SIZE,
      currentPage
    );

    // Create and send embed
    const embed = createMonsterEmbed({
      title: ``,
      description: content.join("\n"),
      authorName: `${username}'s Pokémon\nShowing: ${format_number(
        content.length
      )}/${format_number(pokemon.length)}`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`,
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent Pokémon for ${interaction.user.tag} in ${guildName}!`);
  } catch (error) {
    logger.error(`Error in checkMonsters for user ${userId}:`, error);
    await queueMessage(
      "An error occurred while fetching your Pokémon. Please try again.",
      interaction,
      false
    );
  }
}

/**
 * Enhanced Pokedex checker with PokeAPI integration
 */
export async function checkPokedex(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;

  try {
    const userPokemon = await userDex(userId);
    const showMissing = interaction.options.get("missing")?.value as boolean;
    const msgArray: string[] = [];
    let pokemonCount = 0;

    // Create a Set for faster lookups
    const userPokemonSet = new Set(userPokemon);

    // Show loading message
    await interaction.channel?.send(
      "Loading Pokédex data... This may take a few moments."
    );

    // Process Pokemon IDs 1-1025 (current max) in batches
    for (let startId = 1; startId <= 1025; startId += 50) {
      const endId = Math.min(startId + 49, 1025);
      const batchIds = Array.from(
        { length: endId - startId + 1 },
        (_, i) => startId + i
      );

      const batchPromises = batchIds.map(async (id) => {
        try {
          const pokemonData = await getPokemonWithSpecies(id);
          if (!pokemonData) return null;

          const { pokemon, species } = pokemonData;
          const count = userPokemon.filter(
            (pokemonId) => pokemonId === id
          ).length;
          const hasMonster = userPokemonSet.has(id);
          const displayName = getPokemonEnglishName(
            species,
            getPokemonDisplayName(pokemon)
          );

          if (hasMonster && !showMissing) {
            return { id, name: displayName, count, display: true };
          } else if (!hasMonster && showMissing) {
            return { id, name: displayName, count: 0, display: true };
          } else if (!showMissing) {
            return { id, name: displayName, count, display: true };
          }

          return null;
        } catch (error) {
          logger.warn(`Error processing Pokemon ID ${id} for Pokedex:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((result) => {
        if (result?.display) {
          msgArray.push(
            `**${result.id}** - **${result.name}** - **${result.count}**`
          );
          pokemonCount++;
        }
      });

      // Add delay between batches
      await new Promise((resolve) => setTimeout(resolve, API_REQUEST_DELAY));
    }

    const { content } = createPaginatedContent(msgArray, DEFAULT_PAGE_SIZE);

    const embed = createMonsterEmbed({
      title: ``,
      description: content.join("\n"),
      authorName: `Pokédex - Total Pokémon: ${pokemonCount}`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`,
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent PokeDex in ${interaction.guild?.name}!`);
  } catch (error) {
    logger.error(`Error in checkPokedex for user ${userId}:`, error);
    await queueMessage(
      "An error occurred while fetching the Pokédex. Please try again.",
      interaction,
      false
    );
  }
}

/**
 * Enhanced favorites checker with PokeAPI integration
 */
export async function checkFavorites(
  interaction: CommandInteraction,
  args: string[]
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const guildName = interaction.guild?.name;

  try {
    logger.debug(
      `Fetching Favorite Pokémon for ${interaction.user.tag} in ${guildName}..`
    );

    const splitMsg = args;
    const sortKey = [splitMsg[1], splitMsg[2]].filter(Boolean).join(" ");
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
    if (
      filterType &&
      filterType.match(/legendary|mythical|ultrabeast|shiny|mega/i)
    ) {
      await interaction.channel?.send(
        "Applying filters to favorites... This may take a moment."
      );
      pokemon = await filterMonsters(pokemon, filterType);
    }

    logger.trace("Successfully fetched! Compiling..");

    // Show loading message for large collections
    if (pokemon.length > 10) {
      await interaction.channel?.send(
        "Processing your favorite Pokémon... This may take a moment."
      );
    }

    // Process and sort monsters
    const processedMonsters = await processMonsters(pokemon);
    const sortedMonsters = sortMonsters(processedMonsters, sortKey);

    // Handle pagination
    let currentPage = 0;
    const messages = sortedMonsters.map((monster) => monster.msg);

    if (
      splitMsg.length >= 4 &&
      !filterType.match(/legendary|mythical|ultrabeast|shiny|mega/i)
    ) {
      const pageNum = parseInt(splitMsg[splitMsg.length - 1]);
      if (!isNaN(pageNum) && pageNum > 0) {
        currentPage = pageNum - 1;
      }
    }

    const { content } = createPaginatedContent(
      messages,
      DEFAULT_PAGE_SIZE,
      currentPage
    );

    // Create and send embed
    const embed = createMonsterEmbed({
      title: ``,
      description: content.join("\n"),
      authorName: `${username}'s Favorites\nShowing: ${format_number(
        content.length
      )}/${format_number(pokemon.length)}\nTotal: ${format_number(
        pokemon.length
      )}`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`,
    });

    await sendEmbedResponse(interaction, embed);
    logger.debug(`Sent favorites in ${guildName}!`);
  } catch (error) {
    logger.error(`Error in checkFavorites for user ${userId}:`, error);
    await queueMessage(
      "An error occurred while fetching your favorites. Please try again.",
      interaction,
      false
    );
  }
}

/**
 * Enhanced search function with PokeAPI integration
 */
export async function searchMonsters(
  interaction: CommandInteraction
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const guildName = interaction.guild?.name;

  try {
    const searchTerm = interaction.options
      .get("pokemon")
      ?.value?.toString()
      ?.toLowerCase()
      ?.replace(/ {2,}/g, " ")
      ?.trim();

    if (!searchTerm) {
      await queueMessage(
        "Please provide a Pokémon name to search for.",
        interaction,
        false
      );
      return;
    }

    const pokemon = await getUsersMonsters(userId);

    if (!pokemon || pokemon.length === 0) {
      await queueMessage(
        "You don't have any monsters in your Pokédex. :(",
        interaction,
        false
      );
      return;
    }

    // Show loading message for search
    await queueMessage(
      "Searching your Pokémon... This may take a moment.",
      interaction,
      true
    );

    // Filter monsters by search term
    const matchedMonsters: IMonsterModel[] = [];

    for (let i = 0; i < pokemon.length; i += BATCH_SIZE) {
      const batch = pokemon.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (monster) => {
        try {
          const pokemonData = await getPokemonWithSpecies(monster.monster_id);
          if (!pokemonData) return null;

          const { pokemon, species } = pokemonData;
          const displayName = getPokemonEnglishName(
            species,
            getPokemonDisplayName(pokemon)
          );
          const cleanName = displayName.toLowerCase().replace(/♂|♀/g, "");

          if (cleanName === searchTerm || cleanName.includes(searchTerm)) {
            return monster;
          }

          return null;
        } catch (error) {
          logger.warn(`Error searching monster ${monster.id}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      matchedMonsters.push(
        ...(batchResults.filter(Boolean) as IMonsterModel[])
      );

      // Add delay between batches
      if (i + BATCH_SIZE < pokemon.length) {
        await new Promise((resolve) => setTimeout(resolve, API_REQUEST_DELAY));
      }
    }

    if (matchedMonsters.length === 0) {
      await queueMessage(`Cannot find '${searchTerm}'.`, interaction, false);
      return;
    }

    // Process and sort by IV (high to low) by default
    const processedMonsters = await processMonsters(matchedMonsters);
    const sortedMonsters = sortMonsters(processedMonsters, "iv high");

    // Create content
    const messages = sortedMonsters.map((monster) =>
      monster.msg.replace("Level", "LVL").replace("Avg IV", "IV")
    );

    const { content } = createPaginatedContent(messages, SEARCH_PAGE_SIZE);

    // Create embed
    const embed = createMonsterEmbed({
      title: ``,
      description: content.join("\n"),
      authorName: `${username}'s search for '${searchTerm}' - Total: ${format_number(
        matchedMonsters.length
      )}/${format_number(pokemon.length)}${
        content.length !== matchedMonsters.length
          ? ` - Pages: ${Math.ceil(matchedMonsters.length / SEARCH_PAGE_SIZE)}`
          : ""
      }`,
      authorIcon: interaction.user.avatarURL()?.toString(),
      authorUrl: `https://bot.smokey.gg/user/${userId}/pokemon`,
    });

    await sendEmbedResponse(interaction, embed, true);
    logger.debug(
      `Sent Pokémon search results for ${username} in ${guildName}!`
    );
  } catch (error) {
    logger.error(`Error in searchMonsters for user ${userId}:`, error);
    await queueMessage(
      "An error occurred while searching. Please try again.",
      interaction,
      false
    );
  }
}

/**
 * Clean up expired cache entries
 */
export function cleanupMonsterCache(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of monsterDataCache.entries()) {
    if (now - value.timestamp > MONSTER_CACHE_TTL) {
      monsterDataCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} expired monster cache entries`);
  }
}

/**
 * Set up periodic cache cleanup
 */
export function setupMonsterCacheCleanup(): void {
  // Clean up cache every 5 minutes
  setInterval(cleanupMonsterCache, 5 * 60 * 1000);
}

/**
 * Get cache statistics
 */
export function getMonsterCacheStats(): { size: number; memoryUsage: string } {
  const memoryUsage = `${Math.round(
    JSON.stringify([...monsterDataCache.values()]).length / 1024
  )} KB`;

  return {
    size: monsterDataCache.size,
    memoryUsage,
  };
}

/**
 * Clear all monster cache
 */
export function clearMonsterCache(): void {
  monsterDataCache.clear();
  logger.info("Monster data cache cleared");
}

/**
 * Pre-warm cache with commonly accessed Pokemon
 * @param pokemonIds - Array of Pokemon IDs to cache
 */
export async function preWarmMonsterCache(pokemonIds: number[]): Promise<void> {
  logger.info(`Pre-warming monster cache with ${pokemonIds.length} Pokemon...`);

  for (let i = 0; i < pokemonIds.length; i += BATCH_SIZE) {
    const batch = pokemonIds.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (id) => {
      try {
        await getPokemonWithSpecies(id);
      } catch (error) {
        logger.warn(`Failed to pre-warm cache for Pokemon ${id}:`, error);
      }
    });

    await Promise.all(promises);

    // Add delay between batches
    if (i + BATCH_SIZE < pokemonIds.length) {
      await new Promise((resolve) => setTimeout(resolve, API_REQUEST_DELAY));
    }
  }

  logger.info(
    `Monster cache pre-warming complete. Cache size: ${monsterDataCache.size}`
  );
}

/**
 * Get comprehensive monster statistics using PokeAPI
 * @param userId - User ID to get stats for
 * @returns Monster statistics object
 */
export async function getMonsterStats(userId: string): Promise<{
  total: number;
  favorites: number;
  shiny: number;
  legendary: number;
  mythical: number;
  ultrabeasts: number;
  averageLevel: number;
  averageIV: number;
}> {
  try {
    const [allMonsters, favoriteMonsters] = await Promise.all([
      getUsersMonsters(userId),
      getUsersFavoriteMonsters(userId),
    ]);

    let legendaryCount = 0;
    let mythicalCount = 0;
    let ultrabeastCount = 0;
    let totalLevel = 0;
    let totalIV = 0;
    let shinyCount = 0;

    // Process in batches to avoid rate limits
    for (let i = 0; i < allMonsters.length; i += BATCH_SIZE) {
      const batch = allMonsters.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (monster) => {
        totalLevel += monster.level;
        totalIV += calculateAverageIV(monster);

        if (monster.shiny) shinyCount++;

        try {
          const pokemonData = await getPokemonWithSpecies(monster.monster_id);
          if (pokemonData?.special) {
            switch (pokemonData.special) {
              case "Legendary":
                legendaryCount++;
                break;
              case "Mythical":
                mythicalCount++;
                break;
              case "Ultrabeast":
                ultrabeastCount++;
                break;
            }
          }
        } catch (error) {
          logger.warn(`Error getting stats for monster ${monster.id}:`, error);
        }
      });

      await Promise.all(batchPromises);

      // Add delay between batches
      if (i + BATCH_SIZE < allMonsters.length) {
        await new Promise((resolve) => setTimeout(resolve, API_REQUEST_DELAY));
      }
    }

    return {
      total: allMonsters.length,
      favorites: favoriteMonsters.length,
      shiny: shinyCount,
      legendary: legendaryCount,
      mythical: mythicalCount,
      ultrabeasts: ultrabeastCount,
      averageLevel:
        allMonsters.length > 0
          ? Math.round(totalLevel / allMonsters.length)
          : 0,
      averageIV:
        allMonsters.length > 0 ? Math.round(totalIV / allMonsters.length) : 0,
    };
  } catch (error) {
    logger.error(`Error getting monster stats for user ${userId}:`, error);
    throw error;
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
export async function processSingleMonster(
  monster: IMonsterModel,
  currentMonsterId?: number
): Promise<ProcessedMonster | null> {
  const processed = await processMonsters([monster], currentMonsterId);
  return processed[0] || null;
}

/**
 * Export for testing - sorts monsters array
 */
export function sortMonstersArray(
  monsters: ProcessedMonster[],
  sortType: string
): ProcessedMonster[] {
  return sortMonsters(monsters, sortType);
}

/**
 * Export for testing - applies filters
 */
export async function applyMonsterFilters(
  monsters: IMonsterModel[],
  filterType: string
): Promise<IMonsterModel[]> {
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

/**
 * Export for testing - gets Pokemon with species data
 */
export async function getPokemonWithSpeciesForTesting(
  pokemonId: number
): Promise<any> {
  return getPokemonWithSpecies(pokemonId);
}

/**
 * Export for testing - gets Pokemon display name
 */
export function getPokemonDisplayNameForTesting(pokemon: Pokemon): string {
  return getPokemonDisplayName(pokemon);
}

/**
 * Export for testing - gets special status
 */
export function getSpecialStatusForTesting(species: any): string | undefined {
  return getSpecialStatus(species);
}

/**
 * Batch process monsters to avoid rate limits
 * @param monsters - Array of monsters to process
 * @param batchSize - Number of monsters to process at once
 * @returns Promise resolving to processed monsters
 */
export async function batchProcessMonsters(
  monsters: IMonsterModel[],
  batchSize: number = BATCH_SIZE
): Promise<ProcessedMonster[]> {
  return processMonsters(monsters);
}
