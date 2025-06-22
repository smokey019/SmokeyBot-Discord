import { CommandInteraction, type CommandInteractionOption } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { MonsterTable, type IMonsterModel } from '../../models/Monster';
import { queueMessage, sendUrgentMessage } from '../message_queue';
import { findMonsterByID, getUserMonster } from './monsters';

const logger = getLogger('Pokémon Release');

// Constants for better maintainability
const MAX_BULK_RELEASE = 35;
const RELEASE_TIMESTAMP = () => Date.now();

// Types for better type safety
interface ReleaseResult {
  success: boolean;
  monster?: IMonsterModel;
  error?: string;
}

interface BulkReleaseResult {
  totalRequested: number;
  successCount: number;
  failedCount: number;
  errors: string[];
}

interface MonsterWithDex extends IMonsterModel {
  dexEntry?: any;
}

/**
 * Enhanced release function with better error handling
 * @param monster_id - The ID of the monster to release
 * @returns Promise<ReleaseResult>
 */
async function release(monster_id: number | string): Promise<ReleaseResult> {
  try {
    const numericId = typeof monster_id === 'string' ? parseInt(monster_id, 10) : monster_id;

    if (isNaN(numericId) || numericId <= 0) {
      return {
        success: false,
        error: 'Invalid monster ID provided'
      };
    }

    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', numericId)
      .update({
        released: 1,
        released_at: RELEASE_TIMESTAMP()
      });

    if (updateResult > 0) {
      logger.trace(`Successfully released monster with ID: ${numericId}`);
      return { success: true };
    } else {
      return {
        success: false,
        error: 'Monster not found or already released'
      };
    }
  } catch (error) {
    logger.error('Error releasing monster:', error);
    return {
      success: false,
      error: `Database error: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Enhanced recover function with better error handling
 * @param monster_id - The ID of the monster to recover
 * @returns Promise<ReleaseResult>
 */
async function recover(monster_id: number | string): Promise<ReleaseResult> {
  try {
    const numericId = typeof monster_id === 'string' ? parseInt(monster_id, 10) : monster_id;

    if (isNaN(numericId) || numericId <= 0) {
      return {
        success: false,
        error: 'Invalid monster ID provided'
      };
    }

    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', numericId)
      .update({ released: 0 });

    if (updateResult > 0) {
      logger.trace(`Successfully recovered monster with ID: ${numericId}`);
      return { success: true };
    } else {
      return {
        success: false,
        error: 'Monster not found or not released'
      };
    }
  } catch (error) {
    logger.error('Error recovering monster:', error);
    return {
      success: false,
      error: `Database error: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Safely get command option value
 * @param option - Command interaction option
 * @returns string | null
 */
function getOptionValue(option: CommandInteractionOption | null): string | null {
  if (!option) return null;
  return option.value?.toString() || null;
}

/**
 * Validate monster ownership and release status
 * @param monster - Monster to validate
 * @param userId - User ID to check ownership
 * @param shouldBeReleased - Whether monster should be released (for recovery)
 * @returns boolean
 */
function validateMonsterOwnership(
  monster: IMonsterModel,
  userId: string,
  shouldBeReleased = false
): boolean {
  if (!monster) return false;
  if (monster.uid !== userId) return false;

  return shouldBeReleased ? monster.released === 1 : monster.released !== 1;
}

/**
 * Get monster with dex entry
 * @param monster - Monster model
 * @returns Promise<MonsterWithDex>
 */
async function getMonsterWithDex(monster: IMonsterModel): Promise<MonsterWithDex> {
  try {
    const dexEntry = await findMonsterByID(monster.monster_id);
    return { ...monster, dexEntry };
  } catch (error) {
    logger.warn(`Could not find dex entry for monster ${monster.monster_id}:`, error);
    return monster;
  }
}

/**
 * Parse bulk release input (comma or space separated)
 * @param input - Input string
 * @returns string[]
 */
function parseBulkInput(input: string): string[] {
  const cleanInput = input.trim();

  // Handle comma-separated values
  if (cleanInput.includes(',')) {
    return cleanInput.split(',').map(id => id.trim()).filter(id => id.length > 0);
  }

  // Handle space-separated values
  if (cleanInput.includes(' ')) {
    return cleanInput.split(/\s+/).filter(id => id.length > 0);
  }

  return [cleanInput];
}

/**
 * Process bulk monster release
 * @param monsterIds - Array of monster IDs
 * @param userId - User ID
 * @returns Promise<BulkReleaseResult>
 */
async function processBulkRelease(monsterIds: string[], userId: string): Promise<BulkReleaseResult> {
  const result: BulkReleaseResult = {
    totalRequested: monsterIds.length,
    successCount: 0,
    failedCount: 0,
    errors: []
  };

  // Process releases with proper error handling
  const releasePromises = monsterIds.map(async (monsterId) => {
    try {
      // Validate ID is numeric
      if (isNaN(parseInt(monsterId, 10))) {
        result.errors.push(`Invalid ID: ${monsterId}`);
        return false;
      }

      const monster = await getUserMonster(monsterId);
      if (!monster) {
        result.errors.push(`Monster not found: ${monsterId}`);
        return false;
      }

      if (!validateMonsterOwnership(monster, userId)) {
        result.errors.push(`Cannot release monster: ${monsterId} (not owned or already released)`);
        return false;
      }

      const releaseResult = await release(monster.id);
      if (releaseResult.success) {
        return true;
      } else {
        result.errors.push(`Failed to release ${monsterId}: ${releaseResult.error}`);
        return false;
      }
    } catch (error) {
      result.errors.push(`Error processing ${monsterId}: ${error.message}`);
      return false;
    }
  });

  const results = await Promise.allSettled(releasePromises);

  results.forEach((promiseResult) => {
    if (promiseResult.status === 'fulfilled' && promiseResult.value === true) {
      result.successCount++;
    } else {
      result.failedCount++;
    }
  });

  return result;
}

/**
 * Enhanced single monster release with comprehensive error handling
 * @param interaction - Discord command interaction
 */
export async function releaseMonster(interaction: CommandInteraction): Promise<void> {
  try {
    const pokemonOption = getOptionValue(interaction.options.get('pokemon'));

    // Handle different input scenarios
    if (pokemonOption && (pokemonOption.includes(',') || pokemonOption.includes(' '))) {
      await handleBulkRelease(interaction, pokemonOption);
      return;
    }

    let targetMonster: IMonsterModel | null = null;

    // Determine which monster to release
    if (!pokemonOption || pokemonOption === '^') {
      // Release latest monster
      const user = await getUser(interaction.user.id);
      if (!user?.latest_monster) {
        await sendUrgentMessage(
          'You have no monsters to release.',
          interaction,
          true
        );
        return;
      }

      targetMonster = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .where('id', user.latest_monster)
        .first();
    } else {
      // Release specific monster by ID
      if (isNaN(parseInt(pokemonOption, 10))) {
        await sendUrgentMessage(
          'Please provide a valid monster ID.',
          interaction,
          true
        );
        return;
      }

      targetMonster = await getUserMonster(pokemonOption);
    }

    if (!targetMonster) {
      await sendUrgentMessage(
        'Monster not found.',
        interaction,
        true
      );
      return;
    }

    // Validate ownership and release status
    if (!validateMonsterOwnership(targetMonster, interaction.user.id)) {
      await sendUrgentMessage(
        'You cannot release this monster (not owned or already released).',
        interaction,
        true
      );
      return;
    }

    // Get monster with dex entry for display
    const monsterWithDex = await getMonsterWithDex(targetMonster);
    const monsterName = monsterWithDex.dexEntry?.name?.english || `Monster #${targetMonster.monster_id}`;

    // Attempt release
    const releaseResult = await release(targetMonster.id);

    if (releaseResult.success) {
      await queueMessage(
        `Successfully released your monster. Goodbye **${monsterName}** 😢`,
        interaction,
        true,
        3 // High priority for success messages
      );
    } else {
      await sendUrgentMessage(
        `Failed to release monster: ${releaseResult.error}`,
        interaction,
        true
      );
    }

  } catch (error) {
    logger.error('Error in releaseMonster:', error);
    await sendUrgentMessage(
      'An unexpected error occurred while releasing your monster.',
      interaction,
      true
    );
  }
}

/**
 * Handle bulk monster release
 * @param interaction - Discord command interaction
 * @param input - Bulk input string
 */
async function handleBulkRelease(interaction: CommandInteraction, input: string): Promise<void> {
  try {
    const monsterIds = parseBulkInput(input);

    if (monsterIds.length > MAX_BULK_RELEASE) {
      await sendUrgentMessage(
        `Too many monsters specified. Maximum allowed: ${MAX_BULK_RELEASE}`,
        interaction,
        true
      );
      return;
    }

    if (monsterIds.length === 0) {
      await sendUrgentMessage(
        'No valid monster IDs provided.',
        interaction,
        true
      );
      return;
    }

    // Process bulk release
    const result = await processBulkRelease(monsterIds, interaction.user.id);

    // Send summary message
    let message = `Bulk Release Summary:\n`;
    message += `📊 Requested: ${result.totalRequested}\n`;
    message += `✅ Released: ${result.successCount}\n`;
    message += `❌ Failed: ${result.failedCount}`;

    if (result.errors.length > 0 && result.errors.length <= 5) {
      message += `\n\nErrors:\n${result.errors.join('\n')}`;
    } else if (result.errors.length > 5) {
      message += `\n\n${result.errors.length} errors occurred (too many to display)`;
    }

    if (result.successCount > 0) {
      message += `\n\nGood luck out there, little ones! 🍀`;
    }

    await queueMessage(message, interaction, true, 2);

  } catch (error) {
    logger.error('Error in handleBulkRelease:', error);
    await sendUrgentMessage(
      'An unexpected error occurred during bulk release.',
      interaction,
      true
    );
  }
}

/**
 * Enhanced monster recovery with comprehensive error handling
 * @param interaction - Discord command interaction
 */
export async function recoverMonster(interaction: CommandInteraction): Promise<void> {
  try {
    const pokemonOption = getOptionValue(interaction.options.get('pokemon'));

    if (!pokemonOption) {
      await sendUrgentMessage(
        'Please specify a monster ID to recover.',
        interaction,
        true
      );
      return;
    }

    if (isNaN(parseInt(pokemonOption, 10))) {
      await sendUrgentMessage(
        'Please provide a valid monster ID.',
        interaction,
        true
      );
      return;
    }

    const targetMonster = await getUserMonster(pokemonOption);

    if (!targetMonster) {
      await sendUrgentMessage(
        'Monster not found.',
        interaction,
        true
      );
      return;
    }

    // Validate ownership and release status (monster should be released to recover)
    if (!validateMonsterOwnership(targetMonster, interaction.user.id, true)) {
      await sendUrgentMessage(
        'You cannot recover this monster (not owned or not released).',
        interaction,
        true
      );
      return;
    }

    // Get monster with dex entry for display
    const monsterWithDex = await getMonsterWithDex(targetMonster);
    const monsterName = monsterWithDex.dexEntry?.name?.english || `Monster #${targetMonster.monster_id}`;

    // Attempt recovery
    const recoverResult = await recover(targetMonster.id);

    if (recoverResult.success) {
      await queueMessage(
        `Successfully recovered your monster. Welcome back **${monsterName}**! 🎉`,
        interaction,
        true,
        3 // High priority for success messages
      );
    } else {
      await sendUrgentMessage(
        `Failed to recover monster: ${recoverResult.error}`,
        interaction,
        true
      );
    }

  } catch (error) {
    logger.error('Error in recoverMonster:', error);
    await sendUrgentMessage(
      'An unexpected error occurred while recovering your monster.',
      interaction,
      true
    );
  }
}

/**
 * Simplified release function for backwards compatibility
 * @deprecated Use releaseMonster instead
 */
export async function releaseMonsterNew(interaction: CommandInteraction): Promise<void> {
  logger.warn('releaseMonsterNew is deprecated, use releaseMonster instead');
  return releaseMonster(interaction);
}

// Export utility functions for testing
export {
  getMonsterWithDex, parseBulkInput,
  processBulkRelease, recover, release, validateMonsterOwnership
};

