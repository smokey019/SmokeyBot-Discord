import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { Client, Collection, CommandInteraction, Message } from "discord.js";
import { readdir, stat } from "fs/promises";
import path from "path";
import type { IGuildSettings } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { msToDetailed } from "../../utils";
import type { ICache } from "../cache";

const logger = getLogger("Commander");

// Constants for better maintainability
const COMMAND_FILE_EXTENSIONS = /\.(ts|js)$/i;
const MAX_COMMAND_LOAD_TIME = 30000; // 30 seconds timeout
const SLASH_COMMAND_RATE_LIMIT_DELAY = 100; // ms between registrations
const DEV_GUILD_ID = "690857004171919370";

// Enhanced error handling
class CommandError extends Error {
  constructor(message: string, public code: string, public commandFile?: string) {
    super(message);
    this.name = 'CommandError';
  }
}

// Enhanced interfaces for better type safety
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

interface LoadCommandsResult {
  loadedCount: number;
  failedCount: number;
  totalFiles: number;
  errors: Array<{ file: string; error: string }>;
}

interface CommandLoadProgress {
  totalFiles: number;
  processedFiles: number;
  successfulLoads: number;
  errors: Array<{ file: string; error: string }>;
}

// Enhanced collections with better typing
export const commands: Collection<string[], (event: runEvent) => any> = new Collection();
export const slashCommands: SlashCommandBuilder[] = [];

// Command metadata storage for debugging and monitoring
const commandMetadata = new Map<string, {
  file: string;
  loadTime: number;
  category: string;
  aliases: string[];
}>();

/**
 * Validates if a file should be processed as a command
 */
function isValidCommandFile(fileName: string): boolean {
  return COMMAND_FILE_EXTENSIONS.test(fileName) && !fileName.startsWith('.');
}

/**
 * Safely imports a command module with timeout and error handling
 */
async function safeImportCommand(filePath: string, fileName: string): Promise<CommandModule | null> {
  try {
    const importPromise = import(filePath);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Import timeout')), MAX_COMMAND_LOAD_TIME);
    });

    const module = await Promise.race([importPromise, timeoutPromise]) as CommandModule;

    // Validate required properties
    if (!module.names || !Array.isArray(module.names) || module.names.length === 0) {
      throw new CommandError('Command module missing valid names array', 'INVALID_NAMES', fileName);
    }

    if (!module.run || typeof module.run !== 'function') {
      throw new CommandError('Command module missing run function', 'INVALID_RUN', fileName);
    }

    return module;
  } catch (error) {
    logger.error(`Failed to import command from ${fileName}:`, error);
    return null;
  }
}

/**
 * Registers a single command with comprehensive validation
 */
function registerCommand(module: CommandModule, fileName: string, category: string): boolean {
  try {
    const startTime = Date.now();

    // Validate command names
    const validNames = module.names.filter(name =>
      typeof name === 'string' &&
      name.length > 0 &&
      name.length <= 32 && // Discord limit
      /^[\w-]+$/.test(name) // Only alphanumeric, underscore, and hyphen
    );

    if (validNames.length === 0) {
      throw new CommandError('No valid command names found', 'INVALID_NAMES', fileName);
    }

    // Check for command name conflicts
    for (const existingNames of commands.keys()) {
      for (const newName of validNames) {
        if (existingNames.includes(newName)) {
          logger.warn(`Command name conflict detected: ${newName} in ${fileName} already exists`);
          return false;
        }
      }
    }

    // Register the command
    commands.set(validNames, module.run);

    // Register slash command if available
    if (module.SlashCommandData) {
      try {
        // Validate slash command data
        const slashData = module.SlashCommandData.toJSON();
        if (slashData.name && slashData.description) {
          slashCommands.push(module.SlashCommandData);
        } else {
          logger.warn(`Invalid slash command data in ${fileName}: missing name or description`);
        }
      } catch (slashError) {
        logger.error(`Error processing slash command data for ${fileName}:`, slashError);
      }
    }

    // Store metadata
    const loadTime = Date.now() - startTime;
    commandMetadata.set(validNames[0], {
      file: fileName,
      loadTime,
      category,
      aliases: validNames
    });

    logger.trace(`Loaded command with alias(es): ${validNames.join(", ")} from ${fileName} (${loadTime}ms)`);
    return true;

  } catch (error) {
    logger.error(`Failed to register command from ${fileName}:`, error);
    return false;
  }
}

/**
 * Loads commands from a specific directory with enhanced error handling
 */
async function loadCommandsFromDirectory(
  dirPath: string,
  category: string,
  progress: CommandLoadProgress
): Promise<LoadCommandsResult> {
  const result: LoadCommandsResult = {
    loadedCount: 0,
    failedCount: 0,
    totalFiles: 0,
    errors: []
  };

  try {
    // Check if directory exists
    try {
      const dirStat = await stat(dirPath);
      if (!dirStat.isDirectory()) {
        throw new Error(`${dirPath} is not a directory`);
      }
    } catch (statError) {
      logger.warn(`Directory ${dirPath} does not exist or is not accessible: ${statError.message}`);
      return result;
    }

    // Read directory contents
    const allFiles = await readdir(dirPath);
    const commandFiles = allFiles.filter(isValidCommandFile);

    result.totalFiles = commandFiles.length;
    progress.totalFiles += commandFiles.length;

    if (commandFiles.length === 0) {
      logger.debug(`No command files found in ${dirPath}`);
      return result;
    }

    logger.debug(`Found ${commandFiles.length} command files in ${dirPath}`);

    // Process each command file
    for (const file of commandFiles) {
      try {
        progress.processedFiles++;

        const filePath = path.join(dirPath, file);
        const module = await safeImportCommand(filePath, file);

        if (module) {
          const success = registerCommand(module, file, category);
          if (success) {
            result.loadedCount++;
            progress.successfulLoads++;
          } else {
            result.failedCount++;
            const error = `Failed to register command from ${file}`;
            result.errors.push({ file, error });
            progress.errors.push({ file, error });
          }
        } else {
          result.failedCount++;
          const error = `Failed to import command module from ${file}`;
          result.errors.push({ file, error });
          progress.errors.push({ file, error });
        }

      } catch (fileError) {
        result.failedCount++;
        const error = `Error processing ${file}: ${fileError.message}`;
        result.errors.push({ file, error });
        progress.errors.push({ file, error });
        logger.error(`Error loading command from ${file}:`, fileError);
      }
    }

    return result;

  } catch (dirError) {
    logger.error(`Error reading directory ${dirPath}:`, dirError);
    throw new CommandError(`Failed to read command directory: ${dirError.message}`, 'DIR_READ_ERROR');
  }
}

/**
 * Enhanced command loading with comprehensive error handling and progress tracking
 */
export async function loadCommands(): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info('Starting command loading process...');

    // Clear existing commands and metadata
    commands.clear();
    slashCommands.length = 0;
    commandMetadata.clear();

    const progress: CommandLoadProgress = {
      totalFiles: 0,
      processedFiles: 0,
      successfulLoads: 0,
      errors: []
    };

    const loadPromises: Promise<LoadCommandsResult>[] = [];

    // Load Pokemon commands
    const pokemonDirPath = path.join(__dirname, "pokemon");
    loadPromises.push(loadCommandsFromDirectory(pokemonDirPath, "pokemon", progress));

    // Load SmokeyBot commands
    const smokeybotDirPath = path.join(__dirname, "smokeybot");
    loadPromises.push(loadCommandsFromDirectory(smokeybotDirPath, "smokeybot", progress));

    // Wait for all directories to be processed
    const results = await Promise.allSettled(loadPromises);

    // Process results
    let totalLoaded = 0;
    let totalFailed = 0;
    const allErrors: Array<{ file: string; error: string }> = [];

    results.forEach((result, index) => {
      const category = index === 0 ? 'pokemon' : 'smokeybot';

      if (result.status === 'fulfilled') {
        totalLoaded += result.value.loadedCount;
        totalFailed += result.value.failedCount;
        allErrors.push(...result.value.errors);

        logger.debug(`${category} commands: ${result.value.loadedCount} loaded, ${result.value.failedCount} failed`);
      } else {
        logger.error(`Failed to load ${category} commands:`, result.reason);
        totalFailed++;
      }
    });

    const loadTime = Date.now() - startTime;

    // Log summary
    logger.info(`Command loading completed in ${msToDetailed(loadTime)}: ${totalLoaded} loaded, ${totalFailed} failed, ${slashCommands.length} slash commands`);

    if (allErrors.length > 0) {
      logger.warn(`Command loading errors:`);
      allErrors.forEach(({ file, error }) => {
        logger.warn(`  ${file}: ${error}`);
      });
    }

    // Log command statistics
    logger.debug(`Total commands registered: ${commands.size}`);
    logger.debug(`Command categories: ${Array.from(new Set(Array.from(commandMetadata.values()).map(m => m.category))).join(', ')}`);

  } catch (error) {
    logger.error('Critical error during command loading:', error);
    throw new CommandError('Failed to load commands', 'LOAD_COMMANDS_ERROR');
  }
}

/**
 * Enhanced slash command registration with better error handling and rate limiting
 */
export async function registerSlashCommands(): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info('Starting slash command registration...');

    if (slashCommands.length === 0) {
      logger.warn('No slash commands to register');
      return;
    }

    // Validate environment variables
    const isDev = process.env.DEV === "true";
    const token = isDev ? process.env.DISCORD_TOKEN_DEV : process.env.DISCORD_TOKEN;
    const clientId = isDev ? process.env.API_CLIENT_ID_DEV : process.env.API_CLIENT_ID;

    if (!token || !clientId) {
      throw new CommandError(
        `Missing required environment variables: ${!token ? 'DISCORD_TOKEN' : ''} ${!clientId ? 'API_CLIENT_ID' : ''}`,
        'MISSING_ENV_VARS'
      );
    }

    // Validate slash command data
    const validSlashCommands = slashCommands.filter(command => {
      try {
        const data = command.toJSON();
        return data.name && data.description && data.name.length <= 32 && data.description.length <= 100;
      } catch (error) {
        logger.warn('Invalid slash command data found:', error);
        return false;
      }
    });

    if (validSlashCommands.length !== slashCommands.length) {
      logger.warn(`Filtered out ${slashCommands.length - validSlashCommands.length} invalid slash commands`);
    }

    const rest = new REST({ version: '10' }).setToken(token);

    if (isDev) {
      logger.debug(`Registering ${validSlashCommands.length} slash commands for development environment`);

      // Register global commands for dev
      await rest.put(Routes.applicationCommands(clientId), {
        body: validSlashCommands,
      });

      // Add rate limiting delay
      await new Promise(resolve => setTimeout(resolve, SLASH_COMMAND_RATE_LIMIT_DELAY));

      // Register guild-specific commands for faster testing
      await rest.put(Routes.applicationGuildCommands(clientId, DEV_GUILD_ID), {
        body: validSlashCommands,
      });

      logger.debug('Development slash commands registered for global and test guild');
    } else {
      logger.debug(`Registering ${validSlashCommands.length} slash commands globally`);

      await rest.put(Routes.applicationCommands(clientId), {
        body: validSlashCommands,
      });

      logger.debug('Production slash commands registered globally');
    }

    const registrationTime = Date.now() - startTime;
    logger.info(`Successfully registered ${validSlashCommands.length} slash commands in ${msToDetailed(registrationTime)}`);

  } catch (error) {
    logger.error('Failed to register slash commands:', error);

    // Provide specific error messages
    if (error.code === 50001) {
      throw new CommandError('Missing access to register slash commands', 'MISSING_PERMISSIONS');
    } else if (error.code === 50035) {
      throw new CommandError('Invalid slash command data provided', 'INVALID_COMMAND_DATA');
    } else {
      throw new CommandError(`Slash command registration failed: ${error.message}`, 'REGISTRATION_ERROR');
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
  commandList: Array<{ name: string; aliases: string[]; category: string; loadTime: number }>;
} {
  const categories: Record<string, number> = {};
  let totalLoadTime = 0;
  const commandList: Array<{ name: string; aliases: string[]; category: string; loadTime: number }> = [];

  for (const [name, metadata] of commandMetadata.entries()) {
    categories[metadata.category] = (categories[metadata.category] || 0) + 1;
    totalLoadTime += metadata.loadTime;
    commandList.push({
      name,
      aliases: metadata.aliases,
      category: metadata.category,
      loadTime: metadata.loadTime
    });
  }

  return {
    totalCommands: commands.size,
    totalSlashCommands: slashCommands.length,
    categories,
    averageLoadTime: commandMetadata.size > 0 ? totalLoadTime / commandMetadata.size : 0,
    commandList
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
    if (aliases.some(alias => alias.toLowerCase() === searchName.toLowerCase())) {
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
  logger.info('Reloading all commands...');

  try {
    await loadCommands();
    await registerSlashCommands();
    logger.info('Commands successfully reloaded');
  } catch (error) {
    logger.error('Failed to reload commands:', error);
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
    issues.push('No commands are loaded');
    recommendations.push('Run loadCommands() to load command modules');
  }

  // Check for slash command coverage
  const commandsWithSlash = Array.from(commandMetadata.values()).filter(m =>
    slashCommands.some(sc => sc.name === m.aliases[0])
  ).length;

  const slashCoverage = commands.size > 0 ? (commandsWithSlash / commands.size) * 100 : 0;

  if (slashCoverage < 80) {
    issues.push(`Low slash command coverage: ${slashCoverage.toFixed(1)}%`);
    recommendations.push('Consider adding slash command data to more commands');
  }

  // Check for slow-loading commands
  const slowCommands = Array.from(commandMetadata.values()).filter(m => m.loadTime > 1000);
  if (slowCommands.length > 0) {
    issues.push(`${slowCommands.length} commands took >1s to load`);
    recommendations.push('Optimize slow-loading command modules');
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    recommendations
  };
}