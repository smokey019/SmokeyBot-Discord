import { CommandInteraction, EmbedBuilder } from "discord.js";
import { discordClient } from "../../bot";
import { GLOBAL_COOLDOWN, type ICache } from "../../clients/cache";
import { getUserDBCount } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import {
  format_number,
  getCurrentTime,
  getRndInteger,
  theWord,
} from "../../utils";
import {
  EmoteQueue,
  FFZ_emoji_queue_attempt_count,
  FFZ_emoji_queue_count,
  queue_add_success,
  queue_attempts,
} from "../emote_queue";
import {
  generatePokemonIVs,
  getMonsterDBCount,
  getPokemonTypeColor,
  getShinyMonsterDBCount
} from "./monsters";
import { getBoostedWeatherSpawns, getCurrentWeather } from "./weather";

const logger = getLogger("Pokémon Utils");

// Constants for better maintainability
const DEFAULT_LEVEL_MIN = 1;
const DEFAULT_LEVEL_MAX = 49;
const PERFECT_IV_ODDS = 45;
const GENDERS = ["M", "F"] as const;

// Types for better type safety
interface ParsedArgs {
  search: string;
  page: number;
  sort: [string, string];
  isQuote: boolean;
  args: string[];
}

/**
 * Options for configuring letter replacement behavior
 */
interface ReplaceLettersOptions {
  /** Probability of replacing each letter (0-1). Default: 0.7 */
  replaceProbability?: number;
  /** Character to replace letters with. Default: '-' */
  replacementChar?: string;
  /** Whether to preserve the first letter of each word. Default: false */
  preserveFirstLetter?: boolean;
  /** Whether to preserve the last letter of each word. Default: false */
  preserveLastLetter?: boolean;
  /** Whether to preserve spaces and punctuation. Default: true */
  preserveNonLetters?: boolean;
  /** Custom regex pattern for characters to replace. Overrides default letter matching */
  customPattern?: RegExp;
}

/**
 * Replaces random letters in a string with a specified character (default: dash)
 *
 * @param input - The input string to process
 * @param options - Configuration options for replacement behavior
 * @returns The string with random letters replaced
 *
 * @example
 * ```typescript
 * // Basic usage - replaces ~70% of letters with dashes
 * replaceRandomLetters("Hello World!") // "H-l-- W-r-d!"
 *
 * // Custom probability
 * replaceRandomLetters("Hello World!", { replaceProbability: 0.9 }) // "----o ----d!"
 *
 * // Preserve first and last letters of words
 * replaceRandomLetters("Hello World!", {
 *   preserveFirstLetter: true,
 *   preserveLastLetter: true
 * }) // "H---o W---d!"
 *
 * // Custom replacement character
 * replaceRandomLetters("Hello World!", { replacementChar: '*' }) // "H*l** W*r*d!"
 * ```
 */
export function replaceRandomLetters(
  input: string,
  options: ReplaceLettersOptions = {}
): string {
  // Destructure options with defaults for backwards compatibility
  const {
    replaceProbability = 0.7,
    replacementChar = '-',
    preserveFirstLetter = false,
    preserveLastLetter = false,
    preserveNonLetters = true,
    customPattern
  } = options;

  // Validate inputs
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string');
  }

  if (replaceProbability < 0 || replaceProbability > 1) {
    throw new RangeError('replaceProbability must be between 0 and 1');
  }

  if (typeof replacementChar !== 'string') {
    throw new TypeError('replacementChar must be a string');
  }

  // Handle empty string
  if (input.length === 0) {
    return input;
  }

  // Default pattern matches letters (a-z, A-Z) and unicode letters
  const letterPattern = customPattern || /\p{L}/u;

  // Split into words if we need to preserve first/last letters
  if (preserveFirstLetter || preserveLastLetter) {
    return input.split(/(\s+|[^\p{L}]+)/u).map(segment => {
      // Skip non-word segments (spaces, punctuation)
      if (!letterPattern.test(segment)) {
        return segment;
      }

      return processWord(segment, {
        replaceProbability,
        replacementChar,
        preserveFirstLetter,
        preserveLastLetter,
        letterPattern
      });
    }).join('');
  }

  // Simple character-by-character processing
  return Array.from(input).map(char => {
    // Skip non-letters if preserveNonLetters is true
    if (preserveNonLetters && !letterPattern.test(char)) {
      return char;
    }

    // Skip non-letters entirely if preserveNonLetters is false
    if (!letterPattern.test(char)) {
      return preserveNonLetters ? char : char;
    }

    // Replace with probability
    return Math.random() < replaceProbability ? replacementChar : char;
  }).join('');
}

/**
 * Helper function to process individual words when preserving first/last letters
 */
function processWord(
  word: string,
  config: {
    replaceProbability: number;
    replacementChar: string;
    preserveFirstLetter: boolean;
    preserveLastLetter: boolean;
    letterPattern: RegExp;
  }
): string {
  const chars = Array.from(word);

  return chars.map((char, index) => {
    // Skip non-letters
    if (!config.letterPattern.test(char)) {
      return char;
    }

    // Preserve first letter
    if (config.preserveFirstLetter && index === 0) {
      return char;
    }

    // Preserve last letter
    if (config.preserveLastLetter && index === chars.length - 1) {
      return char;
    }

    // Replace with probability
    return Math.random() < config.replaceProbability ? config.replacementChar : char;
  }).join('');
}

/**
 * Simplified version with just probability control for basic use cases
 *
 * @param input - The input string to process
 * @param probability - Probability of replacing each letter (0-1). Default: 0.7
 * @returns The string with random letters replaced with dashes
 *
 * @example
 * ```typescript
 * replaceLettersSimple("Hello World!") // "H-l-- W-r-d!"
 * replaceLettersSimple("Hello World!", 0.9) // "----o ----d!"
 * ```
 */
export function replaceLettersSimple(input: string, probability: number = 0.7): string {
  return replaceRandomLetters(input, { replaceProbability: probability });
}

/**
 * Preset function for creating redacted text (preserves first and last letters)
 *
 * @param input - The input string to redact
 * @param intensity - How much to redact (0-1). Default: 0.8
 * @returns Redacted string with first and last letters of words preserved
 *
 * @example
 * ```typescript
 * createRedactedText("Hello World!") // "H---o W---d!"
 * createRedactedText("Secret Message", 0.9) // "S----t M-----e"
 * ```
 */
export function createRedactedText(input: string, intensity: number = 0.8): string {
  return replaceRandomLetters(input, {
    replaceProbability: intensity,
    preserveFirstLetter: true,
    preserveLastLetter: true
  });
}

/**
 * Capitalize first letter of a string
 * @param val - String to capitalize
 * @returns Capitalized string
 */
export function capitalizeFirstLetter(val: string): string {
  if (!val || typeof val !== 'string') return '';
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

/**
 * argument parsing with better type safety
 * @param args - Array of command arguments
 * @returns Parsed arguments object
 */
export async function parseArgs(args: string[]): Promise<ParsedArgs> {
  if (!Array.isArray(args)) {
    return {
      search: '',
      page: 0,
      sort: ["id", "high"],
      isQuote: false,
      args: []
    };
  }

  const workingArgs = [...args]; // Don't mutate original array
  const sort: [string, string] = ["id", "high"];
  let search = '';
  let page = 0;

  // Check if last argument is a page number
  const lastArg = workingArgs[workingArgs.length - 1];
  if (lastArg && !isNaN(parseInt(lastArg, 10))) {
    page = Math.max(0, parseInt(lastArg, 10)); // Ensure non-negative
    workingArgs.pop(); // Remove page number from search terms
  }

  // Join remaining arguments as search term
  search = workingArgs.join(" ").trim();

  return {
    search,
    page,
    sort,
    isQuote: false,
    args: workingArgs,
  };
}

/**
 * Returns a randomized level within specified bounds
 * @param min - Minimum level (default: 1)
 * @param max - Maximum level (default: 49)
 * @returns Random level
 */
export function rollLevel(
  min: number = DEFAULT_LEVEL_MIN,
  max: number = DEFAULT_LEVEL_MAX
): number {
  const minLevel = Math.max(1, Math.floor(min));
  const maxLevel = Math.max(minLevel, Math.floor(max));
  return getRndInteger(minLevel, maxLevel);
}

/**
 * Returns a random gender
 * @returns Gender as "M" or "F"
 */
export function rollGender(): "M" | "F" {
  return GENDERS[getRndInteger(0, 1)];
}

/**
 * Returns whether a Pokemon should be shiny based on configured odds
 * @returns 1 if shiny, 0 if not
 */
export function rollShiny(): 0 | 1 {
  const shinyOddsRetail = parseInt(process.env.SHINY_ODDS_RETAIL || "4096", 10);

  if (isNaN(shinyOddsRetail) || shinyOddsRetail <= 0) {
    logger.warn("Invalid SHINY_ODDS_RETAIL value, using default 4096");
    return getRndInteger(1, 4096) >= 4096 ? 1 : 0;
  }

  return getRndInteger(1, shinyOddsRetail) >= shinyOddsRetail ? 1 : 0;
}

/**
 * perfect IV roll with configurable odds
 * @param customOdds - Custom odds for perfect IV (default: 45)
 * @returns Boolean indicating if Pokemon should have perfect IVs
 */
export function rollPerfectIV(customOdds: number = PERFECT_IV_ODDS): boolean {
  const odds = Math.max(1, Math.floor(customOdds));
  return getRndInteger(1, odds) >= odds;
}

/**
 * Generate complete IV stats (version using monsters.ts)
 * @param isPerfect - Whether to generate high IV stats
 * @returns Complete IV object with percentage
 */
export function rollCompleteIVs(isPerfect: boolean = false): {
  ivs: ReturnType<typeof generatePokemonIVs>;
  percentage: number;
} {
  const ivs = generatePokemonIVs(isPerfect);
  const MAX_IV_TOTAL = 186; // 31 * 6 stats
  const totalIV = ivs.hp + ivs.attack + ivs.defense + ivs.sp_attack + ivs.sp_defense + ivs.speed;
  const percentage = parseFloat(((totalIV / MAX_IV_TOTAL) * 100).toFixed(2));

  return { ivs, percentage };
}

/**
 * server weather check with better error handling
 * @param interaction - Discord command interaction
 * @param cache - Server cache
 */
export async function checkServerWeather(
  interaction: CommandInteraction,
  cache: ICache
): Promise<void> {
  try {
    const boost = await getBoostedWeatherSpawns(interaction, cache);

    if (!boost) {
      await interaction.reply({
        content: "Unable to determine current weather. Please try again later.",
        ephemeral: true
      });
      return;
    }

    const boostedTypes = boost.boosts.join(" / ");
    const message = `The current weather is **${boost.weather}**. ` +
                   `You will find increased spawns of **${boostedTypes}** types on this server.`;

    await interaction.reply(message);

  } catch (error) {
    logger.error("Error checking server weather:", error);
    await interaction.reply({
      content: "An error occurred while checking the weather.",
      ephemeral: true
    });
  }
}

/**
 * bot statistics with better formatting and error handling
 * @param interaction - Discord command interaction
 */
export async function getBotStats(interaction: CommandInteraction): Promise<void> {
  try {
    if (interaction.guild?.id) {
      GLOBAL_COOLDOWN.set(interaction.guild.id, getCurrentTime());
    }

    const ping = Date.now() - interaction.createdTimestamp;
    const wsPing = discordClient.ws.ping;

    // Gather all stats with proper error handling
    const [monsterCount, shinyCount, userCount] = await Promise.allSettled([
      (getMonsterDBCount()).toString(),
      (getShinyMonsterDBCount()).toString(),
      (getUserDBCount()).toString()
    ]);

    const getStatValue = (result: PromiseSettledResult<string>): string => {
      return result.status === 'fulfilled' ? format_number(result.value) : 'Error';
    };

    // Get current weather if available
    const currentWeather = interaction.guild?.id
      ? await getCurrentWeather(interaction.guild.id)
      : null;

    const embed = new EmbedBuilder()
      .setTitle("SmokeyBot Statistics 📊")
      .addFields(
        {
          name: "Response Time ⚡",
          value: `${ping}ms (WS: ${wsPing}ms)`,
          inline: true
        },
        {
          name: "Servers in Emote Queue 🔗",
          value: format_number(EmoteQueue.size),
          inline: true
        },
        {
          name: "Emote Synchronizations 🔼",
          value: `${format_number(queue_attempts() + FFZ_emoji_queue_count())} / ${format_number(queue_add_success() + FFZ_emoji_queue_attempt_count())}`,
          inline: true
        },
        {
          name: "Servers On This Shard 🖥️",
          value: format_number(discordClient.guilds.cache.size),
          inline: true
        },
        {
          name: `Total ${theWord()} 🐾`,
          value: getStatValue(monsterCount),
          inline: true
        },
        {
          name: `Total Shiny ${theWord()} 🌟`,
          value: getStatValue(shinyCount),
          inline: true
        },
        {
          name: `Total ${theWord()} Users 👤`,
          value: getStatValue(userCount),
          inline: true
        }
      )
      .setColor(getPokemonTypeColor('normal'))
      .setTimestamp();

    // Add weather info if available
    if (currentWeather) {
      embed.addFields({
        name: "Current Weather 🌤️",
        value: `**${currentWeather.weather}** (Boosts: ${currentWeather.boosts.join(", ")})`,
        inline: false
      });
    }

    // Add footer with shard info if available
    if (discordClient.shard) {
      embed.setFooter({
        text: `Shard ${discordClient.shard.ids.join(', ')} | ${discordClient.guilds.cache.size} servers`
      });
    }

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error("Error getting bot stats:", error);
    await interaction.reply({
      content: "An error occurred while gathering bot statistics.",
      ephemeral: true
    });
  }
}

/**
 * shiny rate calculator
 * @param customOdds - Custom shiny odds (optional)
 * @returns Shiny rate information
 */
export function getShinyRateInfo(customOdds?: number): {
  odds: number;
  percentage: string;
  description: string;
} {
  const odds = customOdds || parseInt(process.env.SHINY_ODDS_RETAIL || "4096", 10);
  const percentage = ((1 / odds) * 100).toFixed(4);

  return {
    odds,
    percentage: `${percentage}%`,
    description: `1 in ${format_number(odds)} (${percentage}%)`
  };
}

/**
 * Format time duration in a human-readable way
 * @param seconds - Duration in seconds
 * @returns Formatted time string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Generate random spawn-related values with proper validation
 * @param config - Configuration for spawn generation
 * @returns Spawn generation result
 */
export function generateSpawnValues(config: {
  levelRange?: [number, number];
  forceShiny?: boolean;
  forcePerfectIV?: boolean;
}): {
  level: number;
  isShiny: boolean;
  isPerfect: boolean;
  gender: "M" | "F";
  ivData: ReturnType<typeof rollCompleteIVs>;
} {
  const { levelRange, forceShiny, forcePerfectIV } = config;

  const [minLevel, maxLevel] = levelRange || [DEFAULT_LEVEL_MIN, DEFAULT_LEVEL_MAX];
  const level = rollLevel(minLevel, maxLevel);
  const isShiny = forceShiny ?? rollShiny() === 1;
  const isPerfect = forcePerfectIV ?? rollPerfectIV();
  const gender = rollGender();
  const ivData = rollCompleteIVs(isPerfect);

  return {
    level,
    isShiny,
    isPerfect,
    gender,
    ivData
  };
}

/**
 * Validate and sanitize user input
 * @param input - User input string
 * @param maxLength - Maximum allowed length
 * @returns Sanitized input
 */
export function sanitizeUserInput(input: string, maxLength: number = 100): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens and spaces
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Check if a value is a valid positive integer
 * @param value - Value to check
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Boolean indicating validity
 */
export function isValidPositiveInteger(
  value: any,
  min: number = 1,
  max: number = Number.MAX_SAFE_INTEGER
): boolean {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= min && num <= max && Number.isInteger(num);
}

// Export constants for use in other modules
export const POKEMON_UTILS_CONSTANTS = {
  DEFAULT_LEVEL_MIN,
  DEFAULT_LEVEL_MAX,
  PERFECT_IV_ODDS,
  GENDERS
} as const;

// Export the image URL constant (keeping original)
export const img_monster_ball = `https://cdn.discordapp.com/attachments/550103813587992586/721256683665621092/pokeball2.png`;