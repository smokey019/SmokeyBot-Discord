import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { Client, Collection, CommandInteraction, Message } from "discord.js";
import type { IGuildSettings } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { msToDetailed } from "../../utils";
import type { ICache } from "../cache";

// Static command imports - Pokemon
import * as adminForceSpawn from "./pokemon/admin-force-spawn";
import * as adminSpawn from "./pokemon/admin-spawn";
import * as battle from "./pokemon/battle";
import * as catchCmd from "./pokemon/catch";
import * as checkFavorites from "./pokemon/check-favorites";
import * as checkMonsters from "./pokemon/check-monsters";
import * as checkVote from "./pokemon/check-vote";
import * as currencyBalance from "./pokemon/currency-balance";
import * as gym from "./pokemon/gym";
import * as info from "./pokemon/info";
import * as item from "./pokemon/item";
import * as leaderboard from "./pokemon/leaderboard";
import * as nickname from "./pokemon/nickname";
import * as pokedex from "./pokemon/pokedex";
import * as pokedexReference from "./pokemon/pokedex-reference";
import * as recover from "./pokemon/recover";
import * as release from "./pokemon/release";
import * as search from "./pokemon/search";
import * as select from "./pokemon/select";
import * as setFavorite from "./pokemon/set-favorite";
import * as team from "./pokemon/team";
import * as trade from "./pokemon/trade";
import * as trainer from "./pokemon/trainer";
import * as unfavorite from "./pokemon/unfavorite";
import * as unique from "./pokemon/unique";
import * as vote from "./pokemon/vote";
import * as weather from "./pokemon/weather";
import * as web from "./pokemon/web";

// Static command imports - SmokeyBot
import * as adminCacheReport from "./smokeybot/admin-cache-report";
import * as adminClearCache from "./smokeybot/admin-clear-cache";
import * as adminResetEmoteTimer from "./smokeybot/admin-reset-emote-timer";
import * as cancelSync from "./smokeybot/cancel-sync";
import * as enableSmokemon from "./smokeybot/enable-smokemon";
import * as funGtfo from "./smokeybot/fun-gtfo";
import * as funSmash from "./smokeybot/fun-smash";
import * as funVase from "./smokeybot/fun-vase";
import * as help from "./smokeybot/help";
import * as inviteLink from "./smokeybot/invite-link";
import * as ping from "./smokeybot/ping";
import * as qremoveEmote from "./smokeybot/qremove-emote";
import * as reportStats from "./smokeybot/report-stats";
import * as statsEmotes from "./smokeybot/stats-emotes";
import * as statsMessages from "./smokeybot/stats-messages";
import * as sync7tv from "./smokeybot/sync-7tv";
import * as syncFfz from "./smokeybot/sync-ffz";
import * as uploadEmote from "./smokeybot/upload-emote";

const logger = getLogger("Commander");

// Constants for better maintainability
const SLASH_COMMAND_RATE_LIMIT_DELAY = 100; // ms between registrations
const DEV_GUILD_ID = "690857004171919370";

// error handling
class CommandError extends Error {
  constructor(
    message: string,
    public code: string,
    public commandFile?: string
  ) {
    super(message);
    this.name = "CommandError";
  }
}

// interfaces for better type safety
export interface runEvent {
  message?: Message;
  interaction?: CommandInteraction;
  client: Client;
  args: string[];
  dev: boolean;
  settings: IGuildSettings;
  cache: ICache;
}

interface CommandModule {
  names: string[];
  run: (event: runEvent) => any;
  SlashCommandData?: SlashCommandBuilder;
  description?: string;
  category?: string;
  permissions?: string[];
  cooldown?: number;
}

// All command modules with their category
const commandModules: Array<{ module: CommandModule; category: string }> = [
  // Pokemon commands
  { module: adminForceSpawn, category: "pokemon" },
  { module: adminSpawn, category: "pokemon" },
  { module: battle, category: "pokemon" },
  { module: catchCmd, category: "pokemon" },
  { module: checkFavorites, category: "pokemon" },
  { module: checkMonsters, category: "pokemon" },
  { module: checkVote, category: "pokemon" },
  { module: currencyBalance, category: "pokemon" },
  { module: gym, category: "pokemon" },
  { module: info, category: "pokemon" },
  { module: item, category: "pokemon" },
  { module: leaderboard, category: "pokemon" },
  { module: nickname, category: "pokemon" },
  { module: pokedex, category: "pokemon" },
  { module: pokedexReference, category: "pokemon" },
  { module: recover, category: "pokemon" },
  { module: release, category: "pokemon" },
  { module: search, category: "pokemon" },
  { module: select, category: "pokemon" },
  { module: setFavorite, category: "pokemon" },
  { module: team, category: "pokemon" },
  { module: trade, category: "pokemon" },
  { module: trainer, category: "pokemon" },
  { module: unfavorite, category: "pokemon" },
  { module: unique, category: "pokemon" },
  { module: vote, category: "pokemon" },
  { module: weather, category: "pokemon" },
  { module: web, category: "pokemon" },
  // SmokeyBot commands
  { module: adminCacheReport, category: "smokeybot" },
  { module: adminClearCache, category: "smokeybot" },
  { module: adminResetEmoteTimer, category: "smokeybot" },
  { module: cancelSync, category: "smokeybot" },
  { module: enableSmokemon, category: "smokeybot" },
  { module: funGtfo, category: "smokeybot" },
  { module: funSmash, category: "smokeybot" },
  { module: funVase, category: "smokeybot" },
  { module: help, category: "smokeybot" },
  { module: inviteLink, category: "smokeybot" },
  { module: ping, category: "smokeybot" },
  { module: qremoveEmote, category: "smokeybot" },
  { module: reportStats, category: "smokeybot" },
  { module: statsEmotes, category: "smokeybot" },
  { module: statsMessages, category: "smokeybot" },
  { module: sync7tv, category: "smokeybot" },
  { module: syncFfz, category: "smokeybot" },
  { module: uploadEmote, category: "smokeybot" },
];

// Command collections for Discord.js compatibility
export const commands: Collection<string[], (event: runEvent) => any> = new Collection();
export const slashCommands: SlashCommandBuilder[] = [];

// Simple metadata for debugging command loading
const commandMetadata = new Map<string, {
  file: string;
  loadTime: number;
  category: string;
}>();

/**
 * Registers a single command with comprehensive validation
 */
function registerCommand(
  module: CommandModule,
  fileName: string,
  category: string
): boolean {
  try {
    const startTime = Date.now();

    // Validate command names
    const validNames = module.names.filter(
      (name) =>
        typeof name === "string" &&
        name.length > 0 &&
        name.length <= 32 && // Discord limit
        /^[\w-]+$/.test(name) // Only alphanumeric, underscore, and hyphen
    );

    if (validNames.length === 0) {
      throw new CommandError(
        "No valid command names found",
        "INVALID_NAMES",
        fileName
      );
    }

    // Check for command name conflicts with existing commands
    for (const existingNames of commands.keys()) {
      for (const newName of validNames) {
        if (existingNames.some(existing => existing.toLowerCase() === newName.toLowerCase())) {
          logger.warn(
            `Command name conflict detected: ${newName} in ${fileName} already exists`
          );
          return false;
        }
      }
    }

    // Register the command
    commands.set(validNames, module.run);

    // Register slash command if available
    if (module.SlashCommandData) {
      try {
        const slashData = module.SlashCommandData.toJSON();
        if (slashData.name && slashData.description) {
          slashCommands.push(module.SlashCommandData);
        } else {
          logger.warn(
            `Invalid slash command data in ${fileName}: missing name or description`
          );
        }
      } catch (slashError) {
        logger.error(
          `Error processing slash command data for ${fileName}:`,
          slashError
        );
      }
    }

    const loadTime = Date.now() - startTime;

    // Store simple metadata for debugging
    commandMetadata.set(validNames[0], {
      file: fileName,
      loadTime,
      category,
    });

    logger.trace(
      `Loaded command: ${validNames[0]} from ${fileName} (${loadTime}ms)`
    );
    return true;
  } catch (error) {
    logger.error(`Failed to register command from ${fileName}:`, error);
    return false;
  }
}

/**
 * Load all commands via static imports (bundle-safe, no filesystem access needed)
 */
export async function loadCommands(): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info("Starting command loading process...");

    // Clear existing commands and metadata
    commands.clear();
    slashCommands.length = 0;
    commandMetadata.clear();

    let totalLoaded = 0;
    let totalFailed = 0;
    const allErrors: Array<{ file: string; error: string }> = [];

    for (const { module, category } of commandModules) {
      const fileName = module.names[0] || "unknown";

      // Validate required properties
      if (!module.names || !Array.isArray(module.names) || module.names.length === 0) {
        totalFailed++;
        allErrors.push({ file: fileName, error: "Missing valid names array" });
        continue;
      }

      if (!module.run || typeof module.run !== "function") {
        totalFailed++;
        allErrors.push({ file: fileName, error: "Missing run function" });
        continue;
      }

      const success = registerCommand(module, fileName, category);
      if (success) {
        totalLoaded++;
      } else {
        totalFailed++;
        allErrors.push({ file: fileName, error: "Failed to register command" });
      }
    }

    const loadTime = Date.now() - startTime;

    // Log summary
    logger.info(
      `Command loading completed in ${msToDetailed(
        loadTime
      )}: ${totalLoaded} loaded, ${totalFailed} failed, ${
        slashCommands.length
      } slash commands`
    );

    if (allErrors.length > 0) {
      logger.warn(`Command loading errors:`);
      allErrors.forEach(({ file, error }) => {
        logger.warn(`  ${file}: ${error}`);
      });
    }

    // Log command statistics
    logger.debug(`Total commands registered: ${commands.size}`);
    logger.debug(
      `Command categories: ${Array.from(
        new Set(Array.from(commandMetadata.values()).map((m) => m.category))
      ).join(", ")}`
    );
  } catch (error) {
    logger.error("Critical error during command loading:", error);
    throw new CommandError("Failed to load commands", "LOAD_COMMANDS_ERROR");
  }
}

/**
 * slash command registration with better error handling and rate limiting
 */
export async function registerSlashCommands(): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info("Starting slash command registration...");

    if (slashCommands.length === 0) {
      logger.warn("No slash commands to register");
      return;
    }

    // Validate environment variables
    const isDev = process.env.DEV === "true";
    const token = isDev
      ? process.env.DISCORD_TOKEN_DEV
      : process.env.DISCORD_TOKEN;
    const clientId = isDev
      ? process.env.API_CLIENT_ID_DEV
      : process.env.API_CLIENT_ID;

    if (!token || !clientId) {
      throw new CommandError(
        `Missing required environment variables: ${
          !token ? "DISCORD_TOKEN" : ""
        } ${!clientId ? "API_CLIENT_ID" : ""}`,
        "MISSING_ENV_VARS"
      );
    }

    // Validate slash command data
    const validSlashCommands = slashCommands.filter((command) => {
      try {
        const data = command.toJSON();
        return (
          data.name &&
          data.description &&
          data.name.length <= 32 &&
          data.description.length <= 100
        );
      } catch (error) {
        logger.warn("Invalid slash command data found:", error);
        return false;
      }
    });

    if (validSlashCommands.length !== slashCommands.length) {
      logger.warn(
        `Filtered out ${
          slashCommands.length - validSlashCommands.length
        } invalid slash commands`
      );
    }

    const rest = new REST({ version: "10" }).setToken(token);

    if (isDev) {
      logger.debug(
        `Registering ${validSlashCommands.length} slash commands for development environment`
      );

      // Register global commands for dev
      await rest.put(Routes.applicationCommands(clientId), {
        body: validSlashCommands,
      });

      // Add rate limiting delay
      await new Promise((resolve) =>
        setTimeout(resolve, SLASH_COMMAND_RATE_LIMIT_DELAY)
      );

      // Register guild-specific commands for faster testing
      await rest.put(Routes.applicationGuildCommands(clientId, DEV_GUILD_ID), {
        body: validSlashCommands,
      });

      logger.debug(
        "Development slash commands registered for global and test guild"
      );
    } else {
      logger.debug(
        `Registering ${validSlashCommands.length} slash commands globally`
      );

      await rest.put(Routes.applicationCommands(clientId), {
        body: validSlashCommands,
      });

      logger.debug("Production slash commands registered globally");
    }

    const registrationTime = Date.now() - startTime;
    logger.info(
      `Successfully registered ${
        validSlashCommands.length
      } slash commands in ${msToDetailed(registrationTime)}`
    );
  } catch (error) {
    logger.error("Failed to register slash commands:", error);

    // Provide specific error messages
    if (error.code === 50001) {
      throw new CommandError(
        "Missing access to register slash commands",
        "MISSING_PERMISSIONS"
      );
    } else if (error.code === 50035) {
      throw new CommandError(
        "Invalid slash command data provided",
        "INVALID_COMMAND_DATA"
      );
    } else {
      throw new CommandError(
        `Slash command registration failed: ${error.message}`,
        "REGISTRATION_ERROR"
      );
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS (Additional exports for monitoring and debugging)
// ============================================================================

/**
 * Get command statistics for monitoring
 */
export function getCommandStats(): {
  totalCommands: number;
  totalSlashCommands: number;
  categories: Record<string, number>;
  averageLoadTime: number;
  commandList: Array<{
    name: string;
    category: string;
    loadTime: number;
  }>;
} {
  const categories: Record<string, number> = {};
  let totalLoadTime = 0;
  const commandList: Array<{
    name: string;
    category: string;
    loadTime: number;
  }> = [];

  for (const [name, metadata] of commandMetadata.entries()) {
    categories[metadata.category] = (categories[metadata.category] || 0) + 1;
    totalLoadTime += metadata.loadTime;
    commandList.push({
      name,
      category: metadata.category,
      loadTime: metadata.loadTime,
    });
  }

  return {
    totalCommands: commands.size,
    totalSlashCommands: slashCommands.length,
    categories,
    averageLoadTime:
      commandMetadata.size > 0 ? totalLoadTime / commandMetadata.size : 0,
    commandList,
  };
}

/**
 * Find command by name or alias
 */
export function findCommand(searchName: string): {
  aliases: string[];
  run: (event: runEvent) => any;
  metadata?: any;
} | null {
  for (const [aliases, runFunction] of commands.entries()) {
    if (
      aliases.some((alias) => alias.toLowerCase() === searchName.toLowerCase())
    ) {
      const metadata = commandMetadata.get(aliases[0]);
      return { aliases, run: runFunction, metadata };
    }
  }
  return null;
}

/**
 * Reload commands (useful for development)
 */
export async function reloadCommands(): Promise<void> {
  logger.info("Reloading all commands...");

  try {
    await loadCommands();
    await registerSlashCommands();
    logger.info("Commands successfully reloaded");
  } catch (error) {
    logger.error("Failed to reload commands:", error);
    throw error;
  }
}

/**
 * Validate command health (useful for monitoring)
 */
export function validateCommandHealth(): {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check if commands are loaded
  if (commands.size === 0) {
    issues.push("No commands are loaded");
    recommendations.push("Run loadCommands() to load command modules");
  }

  // Check for slash command coverage
  const slashCoverage =
    commands.size > 0 ? (slashCommands.length / commands.size) * 100 : 0;

  if (slashCoverage < 80) {
    issues.push(`Low slash command coverage: ${slashCoverage.toFixed(1)}%`);
    recommendations.push("Consider adding slash command data to more commands");
  }

  // Check for slow-loading commands
  const slowCommands = Array.from(commandMetadata.values()).filter(
    (m) => m.loadTime > 1000
  );
  if (slowCommands.length > 0) {
    issues.push(`${slowCommands.length} commands took >1s to load`);
    recommendations.push("Optimize slow-loading command modules");
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    recommendations,
  };
}
