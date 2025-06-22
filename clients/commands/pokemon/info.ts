import { SlashCommandBuilder } from '@discordjs/builders';
import { ChannelType } from 'discord.js';
import type { runEvent } from '..';
import { GLOBAL_COOLDOWN, getGCD } from '../../../clients/cache';
import { getLogger } from '../../../clients/logger';
import { getCurrentTime } from '../../../utils';
import { queueMessage } from '../../message_queue';
import {
  currentMonsterInfo,
  monsterInfo,
  monsterInfoLatest
} from '../../pokemon/info';

const logger = getLogger('Pokemon-Info-Command');

// Constants for better maintainability
const COMMAND_COOLDOWN = 3; // seconds
const LATEST_ALIASES = ['latest', 'l', 'last', 'recent'];
const CURRENT_ALIASES = ['current', 'selected', 'active'];

// Enhanced error handling
class InfoCommandError extends Error {
  constructor(message: string, public code: string, public userId?: string) {
    super(message);
    this.name = 'InfoCommandError';
  }
}

// Enhanced interfaces for better type safety
interface CommandValidationResult {
  isValid: boolean;
  errorMessage?: string;
  canProceed: boolean;
}

interface ChannelValidationOptions {
  settings: any;
  channel: any;
  interaction: any;
}

/**
 * Validates if the command can be executed in the current context
 */
function validateCommandExecution({ settings, channel, interaction }: ChannelValidationOptions): CommandValidationResult {
  try {
    // Check if Pokemon module is enabled
    if (!settings?.smokemon_enabled) {
      logger.debug(`Pokemon module disabled in guild ${interaction.guild?.id}`);
      return {
        isValid: false,
        errorMessage: "Pokemon features are currently disabled in this server.",
        canProceed: false
      };
    }

    // Validate channel type
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(`Command used in invalid channel type: ${channel?.type}`);
      return {
        isValid: false,
        errorMessage: "This command can only be used in text channels.",
        canProceed: false
      };
    }

    // Check if specific channel is required and matches
    if (settings.specific_channel && channel.name !== settings.specific_channel) {
      logger.debug(`Command used in wrong channel: ${channel.name}, expected: ${settings.specific_channel}`);
      return {
        isValid: false,
        errorMessage: `This command can only be used in #${settings.specific_channel}.`,
        canProceed: false
      };
    }

    return {
      isValid: true,
      canProceed: true
    };
  } catch (error) {
    logger.error('Error validating command execution:', error);
    return {
      isValid: false,
      errorMessage: "An error occurred while validating the command. Please try again.",
      canProceed: false
    };
  }
}

/**
 * Validates and normalizes the Pokemon ID parameter
 */
function validatePokemonId(rawId: string | undefined): {
  id: string | null;
  type: 'specific' | 'current' | 'latest';
  isValid: boolean;
  errorMessage?: string;
} {
  // No ID provided - default to current Pokemon
  if (!rawId) {
    return {
      id: null,
      type: 'current',
      isValid: true
    };
  }

  const normalizedId = rawId.toString().toLowerCase().trim();

  // Check for latest aliases
  if (LATEST_ALIASES.includes(normalizedId)) {
    return {
      id: normalizedId,
      type: 'latest',
      isValid: true
    };
  }

  // Check for current aliases
  if (CURRENT_ALIASES.includes(normalizedId)) {
    return {
      id: null,
      type: 'current',
      isValid: true
    };
  }

  // Validate numeric ID
  const numericId = parseInt(normalizedId, 10);
  if (isNaN(numericId) || numericId <= 0) {
    return {
      id: normalizedId,
      type: 'specific',
      isValid: false,
      errorMessage: "Please provide a valid Pokemon ID number, or use 'latest' to see your most recent catch."
    };
  }

  // Valid numeric ID
  return {
    id: normalizedId,
    type: 'specific',
    isValid: true
  };
}

/**
 * Checks and applies command cooldown
 */
async function handleCommandCooldown(guildId: string, userId: string): Promise<{
  canProceed: boolean;
  remainingTime?: number;
  errorMessage?: string;
}> {
  try {
    const currentTime = getCurrentTime();
    const lastCommandTime = await getGCD(guildId) || 0;
    const timeSinceLastCommand = currentTime - lastCommandTime;

    if (timeSinceLastCommand < COMMAND_COOLDOWN) {
      const remainingTime = COMMAND_COOLDOWN - timeSinceLastCommand;
      return {
        canProceed: false,
        remainingTime,
        errorMessage: `Please wait ${remainingTime.toFixed(1)} more seconds before using this command again.`
      };
    }

    // Set new cooldown
    GLOBAL_COOLDOWN.set(guildId, currentTime);
    return { canProceed: true };

  } catch (error) {
    logger.error('Error handling command cooldown:', error);
    // Allow command to proceed if cooldown check fails
    return { canProceed: true };
  }
}

/**
 * Logs command usage for monitoring and debugging
 */
function logCommandUsage(interaction: any, pokemonIdType: string, pokemonId: string | null): void {
  try {
    const userId = interaction.user?.id || 'unknown';
    const username = interaction.user?.username || 'unknown';
    const guildName = interaction.guild?.name || 'unknown';
    const channelName = interaction.channel?.name || 'unknown';

    logger.info(`Pokemon info command used by ${username} (${userId}) in ${guildName}/#${channelName} - Type: ${pokemonIdType}, ID: ${pokemonId || 'none'}`);
  } catch (error) {
    logger.warn('Failed to log command usage:', error);
  }
}

/**
 * Executes the appropriate info function based on the validated parameters
 */
async function executeInfoCommand(
  interaction: any,
  pokemonIdType: 'specific' | 'current' | 'latest',
  pokemonId: string | null
): Promise<void> {
  try {
    switch (pokemonIdType) {
      case 'specific':
        if (!pokemonId) {
          throw new InfoCommandError('Pokemon ID is required for specific lookup', 'MISSING_ID');
        }
        await monsterInfo(interaction, pokemonId);
        break;

      case 'latest':
        await monsterInfoLatest(interaction);
        break;

      case 'current':
      default:
        await currentMonsterInfo(interaction);
        break;
    }
  } catch (error) {
    logger.error(`Error executing ${pokemonIdType} info command:`, error);

    // Provide user-friendly error messages
    let errorMessage = "An error occurred while getting Pokemon information. Please try again.";

    if (error.message.includes('not found')) {
      errorMessage = "Pokemon not found. Please check the ID and try again.";
    } else if (error.message.includes('no current')) {
      errorMessage = "You don't have a currently selected Pokemon. Use the select command to choose one.";
    } else if (error.message.includes('no latest')) {
      errorMessage = "No recent Pokemon found. Catch a Pokemon first!";
    }

    await queueMessage(errorMessage, interaction, true);
  }
}

/**
 * Enhanced main run function with comprehensive error handling and validation
 */
export async function run(e: runEvent): Promise<void> {
  const startTime = Date.now();
  const userId = e.interaction.user?.id;
  const guildId = e.interaction.guild?.id;

  try {
    // Validate command execution context
    const validation = validateCommandExecution({
      settings: e.cache.settings,
      channel: e.interaction.channel,
      interaction: e.interaction
    });

    if (!validation.canProceed) {
      if (validation.errorMessage) {
        logger.debug(`Command validation failed for user ${userId}: ${validation.errorMessage}`);
        // Don't send error message for channel/settings restrictions to avoid spam
        return;
      }
      return;
    }

    // Check command cooldown
    if (guildId) {
      const cooldownCheck = await handleCommandCooldown(guildId, userId);
      if (!cooldownCheck.canProceed) {
        if (cooldownCheck.errorMessage) {
          await queueMessage(cooldownCheck.errorMessage, e.interaction, true);
        }
        return;
      }
    }

    // Get and validate Pokemon ID parameter
    const rawPokemonId = e.interaction.options.get('pokemon')?.value?.toString();
    const pokemonValidation = validatePokemonId(rawPokemonId);

    if (!pokemonValidation.isValid) {
      await queueMessage(
        pokemonValidation.errorMessage || "Invalid Pokemon ID provided.",
        e.interaction,
        true
      );
      return;
    }

    // Log command usage
    logCommandUsage(e.interaction, pokemonValidation.type, pokemonValidation.id);

    // Execute the appropriate info command
    await executeInfoCommand(e.interaction, pokemonValidation.type, pokemonValidation.id);

    // Log successful execution
    const executionTime = Date.now() - startTime;
    logger.debug(`Pokemon info command completed for user ${userId} in ${executionTime}ms`);

  } catch (error) {
    logger.error(`Critical error in Pokemon info command for user ${userId}:`, error);

    try {
      await queueMessage(
        "A critical error occurred. Please contact an administrator if this persists.",
        e.interaction,
        true
      );
    } catch (replyError) {
      logger.error('Failed to send error response:', replyError);
    }
  }
}

// Maintain backward compatibility - export original names
export const names = ['info', 'i'];

// Enhanced slash command data with better descriptions and validation
export const SlashCommandData = new SlashCommandBuilder()
  .setName('info')
  .setDescription("Display detailed information about a Pokemon.")
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription(
        "Pokemon ID number, 'latest' for most recent catch, or leave blank for current selection."
      )
      .setRequired(false)
  );

// ============================================================================
// UTILITY FUNCTIONS (Additional exports for testing and debugging)
// ============================================================================

/**
 * Export for testing - validates command execution context
 */
export function validateExecution(settings: any, channel: any, interaction: any): CommandValidationResult {
  return validateCommandExecution({ settings, channel, interaction });
}

/**
 * Export for testing - validates Pokemon ID input
 */
export function validatePokemonInput(rawId: string | undefined) {
  return validatePokemonId(rawId);
}

/**
 * Export for testing - checks command cooldown
 */
export async function checkCooldown(guildId: string, userId: string) {
  return await handleCommandCooldown(guildId, userId);
}

/**
 * Get command statistics and configuration
 */
export function getCommandInfo(): {
  cooldown: number;
  latestAliases: string[];
  currentAliases: string[];
  supportedNames: string[];
} {
  return {
    cooldown: COMMAND_COOLDOWN,
    latestAliases: [...LATEST_ALIASES],
    currentAliases: [...CURRENT_ALIASES],
    supportedNames: [...names]
  };
}

/**
 * Legacy support function - handles old command format
 * This ensures backward compatibility with any existing integrations
 */
export async function runLegacy(e: runEvent): Promise<void> {
  logger.debug('Legacy command format detected, redirecting to enhanced run function');
  await run(e);
}