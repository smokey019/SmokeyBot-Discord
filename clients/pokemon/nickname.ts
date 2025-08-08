import { ChatInputChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { MonsterTable, type IMonsterModel } from '../../models/Monster';
import { queueMessage } from '../message_queue';
import {
    findMonsterByID,
    getPokemonDisplayName,
    getPokemonSprites,
    getUserMonster,
    type Pokemon,
} from './monsters';

const logger = getLogger('Nickname');

// Constants for validation and security
const MAX_NICKNAME_LENGTH = 32;
const MIN_NICKNAME_LENGTH = 1;
const NICKNAME_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// error handling
class NicknameError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "NicknameError";
  }
}

// Profanity filter - basic list (expand as needed)
const PROFANITY_LIST = [
  'fuck', 'shit', 'damn', 'bitch', 'ass', 'hell', 'crap', 'piss',
  'bastard', 'whore', 'slut', 'fag', 'retard', 'nigger', 'nazi',
  'hitler', 'kill', 'die', 'suicide', 'rape', 'murder'
];

// Inappropriate patterns
const INAPPROPRIATE_PATTERNS = [
  /discord\.gg/i,           // Discord invite links
  /https?:\/\//i,           // URLs
  /@everyone/i,             // Discord mentions
  /@here/i,                 // Discord mentions
  /\<@[!&]?\d+\>/i,        // Discord user/role mentions
  /\<#\d+\>/i,             // Discord channel mentions
  /\<:\w+:\d+\>/i,         // Discord custom emojis
  /\<a:\w+:\d+\>/i,        // Discord animated emojis
];

/**
 * Comprehensive input sanitization for nicknames
 * @param input - Raw nickname input from user
 * @returns Sanitized nickname or null if invalid
 */
function sanitizeNickname(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Trim whitespace
  let sanitized = input.trim();

  // Check length constraints
  if (sanitized.length < MIN_NICKNAME_LENGTH || sanitized.length > MAX_NICKNAME_LENGTH) {
    return null;
  }

  // Remove or escape potentially dangerous characters
  sanitized = sanitized
    .replace(/[<>]/g, '') // Remove angle brackets (XSS prevention)
    .replace(/['"]/g, '') // Remove quotes (SQL injection prevention)
    .replace(/[`]/g, '')  // Remove backticks
    .replace(/[\r\n\t]/g, ' ') // Replace line breaks with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  // Check for inappropriate patterns
  for (const pattern of INAPPROPRIATE_PATTERNS) {
    if (pattern.test(sanitized)) {
      return null;
    }
  }

  // Basic profanity filter (case-insensitive)
  const lowerSanitized = sanitized.toLowerCase();
  for (const word of PROFANITY_LIST) {
    if (lowerSanitized.includes(word.toLowerCase())) {
      return null;
    }
  }

  // Ensure nickname isn't just special characters or numbers
  if (!/[a-zA-Z]/.test(sanitized)) {
    return null;
  }

  // Final length check after sanitization
  if (sanitized.length < MIN_NICKNAME_LENGTH) {
    return null;
  }

  return sanitized;
}

/**
 * Validate nickname uniqueness for user (optional feature)
 * @param userId - User ID
 * @param nickname - Proposed nickname
 * @param excludeId - Monster ID to exclude from check (for updates)
 * @returns Whether nickname is unique for this user
 */
async function isNicknameUniqueForUser(
  userId: string,
  nickname: string,
  excludeId?: number
): Promise<boolean> {
  try {
    let query = databaseClient<IMonsterModel>(MonsterTable)
      .select('id')
      .where({ uid: userId, nickname: nickname.toLowerCase() })
      .whereNot('released', 1);

    if (excludeId) {
      query = query.whereNot('id', excludeId);
    }

    const existing = await query.first();
    return !existing;
  } catch (error) {
    logger.error('Error checking nickname uniqueness:', error);
    return true; // Allow on error to not block users
  }
}

/**
 * set nickname function with comprehensive validation
 * @param interaction - Discord command interaction
 */
export async function setNickname(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    // Get and validate input
    const rawNickname = interaction.options.get('pokemon')?.value?.toString();

    if (!rawNickname) {
      await queueMessage(
        "❌ Please provide a nickname for your Pokémon.",
        interaction,
        true
      );
      return;
    }

    // Sanitize input
    const sanitizedNickname = sanitizeNickname(rawNickname);

    if (!sanitizedNickname) {
      await queueMessage(
        `❌ Invalid nickname. Nicknames must be ${MIN_NICKNAME_LENGTH}-${MAX_NICKNAME_LENGTH} characters, ` +
        "contain at least one letter, and cannot contain inappropriate content, links, or special characters.",
        interaction,
        true
      );
      return;
    }

    // Get user data
    const user = await getUser(interaction.user.id);
    if (!user?.current_monster) {
      await queueMessage(
        "❌ You don't have a Pokémon currently selected. Use `/select` to choose a Pokémon first.",
        interaction,
        true
      );
      return;
    }

    // Get current monster data
    const monster = await getUserMonster(user.current_monster);
    if (!monster) {
      await queueMessage(
        "❌ Your current Pokémon could not be found. Please select a different Pokémon.",
        interaction,
        true
      );
      return;
    }

    if (monster.uid !== interaction.user.id) {
      await queueMessage(
        "❌ You can only nickname your own Pokémon.",
        interaction,
        true
      );
      return;
    }

    // Check nickname uniqueness (optional - uncomment if desired)
    /*
    const isUnique = await isNicknameUniqueForUser(
      interaction.user.id,
      sanitizedNickname,
      monster.id
    );

    if (!isUnique) {
      await queueMessage(
        "❌ You already have a Pokémon with this nickname. Please choose a different one.",
        interaction,
        true
      );
      return;
    }
    */

    // Get Pokémon data for messaging
    const pokemonData = await findMonsterByID(monster.monster_id);
    if (!pokemonData) {
      logger.warn(`Pokemon data not found for monster ${monster.id}`);
    }

    // Update nickname in database
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', user.current_monster)
      .update({
        nickname: sanitizedNickname,
        nickname_set_at: Date.now().toString() // Track when nickname was set
      });

    if (!updateResult) {
      throw new NicknameError("Database update failed", "UPDATE_FAILED");
    }

    // Create success response with Pokemon information
    await sendNicknameSuccessMessage(
      interaction,
      monster,
      pokemonData,
      sanitizedNickname
    );

    logger.info(`User ${interaction.user.id} nicknamed monster ${monster.id} as "${sanitizedNickname}"`);
  } catch (error) {
    logger.error('Error in setNickname:', error);
    await queueMessage(
      "❌ An error occurred while setting the nickname. Please try again.",
      interaction,
      true
    );
  }
}

/**
 * Remove nickname from current Pokémon
 * @param interaction - Discord command interaction
 */
export async function removeNickname(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const user = await getUser(interaction.user.id);
    if (!user?.current_monster) {
      await queueMessage(
        "❌ You don't have a Pokémon currently selected.",
        interaction,
        true
      );
      return;
    }

    const monster = await getUserMonster(user.current_monster);
    if (!monster) {
      await queueMessage(
        "❌ Your current Pokémon could not be found.",
        interaction,
        true
      );
      return;
    }

    if (!monster.nickname) {
      await queueMessage(
        "❌ Your current Pokémon doesn't have a nickname to remove.",
        interaction,
        true
      );
      return;
    }

    const pokemonData = await findMonsterByID(monster.monster_id);
    const originalName = pokemonData ? getPokemonDisplayName(pokemonData) : 'Unknown';
    const oldNickname = monster.nickname;

    // Remove nickname
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', user.current_monster)
      .update({
        nickname: null,
        nickname_set_at: Date.now().toString()
      });

    if (!updateResult) {
      throw new NicknameError("Database update failed", "UPDATE_FAILED");
    }

    await queueMessage(
      `✅ Removed nickname "${oldNickname}" from your **${originalName}**. ` +
      `It's now back to its original name.`,
      interaction,
      true
    );

    logger.info(`User ${interaction.user.id} removed nickname "${oldNickname}" from monster ${monster.id}`);
  } catch (error) {
    logger.error('Error in removeNickname:', error);
    await queueMessage(
      "❌ An error occurred while removing the nickname. Please try again.",
      interaction,
      true
    );
  }
}

/**
 * View current Pokémon's nickname and information
 * @param interaction - Discord command interaction
 */
export async function viewNickname(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const user = await getUser(interaction.user.id);
    if (!user?.current_monster) {
      await queueMessage(
        "❌ You don't have a Pokémon currently selected.",
        interaction,
        true
      );
      return;
    }

    const monster = await getUserMonster(user.current_monster);
    if (!monster) {
      await queueMessage(
        "❌ Your current Pokémon could not be found.",
        interaction,
        true
      );
      return;
    }

    const pokemonData = await findMonsterByID(monster.monster_id);
    if (!pokemonData) {
      await queueMessage(
        "❌ Could not retrieve Pokémon data.",
        interaction,
        true
      );
      return;
    }

    await sendPokemonInfoMessage(interaction, monster, pokemonData);
  } catch (error) {
    logger.error('Error in viewNickname:', error);
    await queueMessage(
      "❌ An error occurred while retrieving Pokémon information.",
      interaction,
      true
    );
  }
}

/**
 * Set nickname for a specific Pokémon by ID
 * @param interaction - Discord command interaction
 */
export async function setNicknameById(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const monsterId = interaction.options.get('id')?.value?.toString();
    const rawNickname = interaction.options.get('nickname')?.value?.toString();

    if (!monsterId || !rawNickname) {
      await queueMessage(
        "❌ Please provide both a Pokémon ID and nickname.",
        interaction,
        true
      );
      return;
    }

    // Sanitize nickname
    const sanitizedNickname = sanitizeNickname(rawNickname);
    if (!sanitizedNickname) {
      await queueMessage(
        `❌ Invalid nickname. Nicknames must be ${MIN_NICKNAME_LENGTH}-${MAX_NICKNAME_LENGTH} characters, ` +
        "contain at least one letter, and cannot contain inappropriate content.",
        interaction,
        true
      );
      return;
    }

    // Get monster
    const monster = await getUserMonster(monsterId);
    if (!monster) {
      await queueMessage(
        "❌ Pokémon not found or you don't own this Pokémon.",
        interaction,
        true
      );
      return;
    }

    if (monster.uid !== interaction.user.id) {
      await queueMessage(
        "❌ You can only nickname your own Pokémon.",
        interaction,
        true
      );
      return;
    }

    // Get Pokemon data
    const pokemonData = await findMonsterByID(monster.monster_id);

    // Update nickname
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', monsterId)
      .update({
        nickname: sanitizedNickname,
        nickname_set_at: Date.now().toString()
      });

    if (!updateResult) {
      throw new NicknameError("Database update failed", "UPDATE_FAILED");
    }

    await sendNicknameSuccessMessage(
      interaction,
      monster,
      pokemonData,
      sanitizedNickname
    );

    logger.info(`User ${interaction.user.id} nicknamed monster ${monsterId} as "${sanitizedNickname}"`);
  } catch (error) {
    logger.error('Error in setNicknameById:', error);
    await queueMessage(
      "❌ An error occurred while setting the nickname. Please try again.",
      interaction,
      true
    );
  }
}

/**
 * Send success message with Pokémon information
 * @param interaction - Discord interaction
 * @param monster - Monster model
 * @param pokemonData - Pokemon API data
 * @param nickname - New nickname
 */
async function sendNicknameSuccessMessage(
  interaction: ChatInputCommandInteraction,
  monster: IMonsterModel,
  pokemonData: Pokemon | null,
  nickname: string
): Promise<void> {
  if (!pokemonData) {
    await queueMessage(
      `✅ Nickname successfully set to **"${nickname}"** for your Pokémon!`,
      interaction,
      true
    );
    return;
  }

  const originalName = getPokemonDisplayName(pokemonData);
  const sprites = getPokemonSprites(pokemonData, Boolean(monster.shiny));
  const shinyIcon = monster.shiny ? ' ⭐' : '';

  const embed = new EmbedBuilder()
    .setTitle(`🏷️ Nickname Set Successfully!`)
    .setDescription(
      `Your **Level ${monster.level} ${originalName}**${shinyIcon} is now nicknamed **"${nickname}"**!`
    )
    .addFields(
      { name: 'Original Name', value: originalName, inline: true },
      { name: 'New Nickname', value: `"${nickname}"`, inline: true },
      { name: 'Pokémon ID', value: monster.id.toString(), inline: true }
    )
    .setThumbnail(sprites.artwork || sprites.default || '')
    .setColor(monster.shiny ? 0xFFD700 : 0x3498DB)
    .setTimestamp();

  await interaction.channel?.send({ embeds: [embed] });
}

/**
 * Send Pokémon information message showing current nickname status
 * @param interaction - Discord interaction
 * @param monster - Monster model
 * @param pokemonData - Pokemon API data
 */
async function sendPokemonInfoMessage(
  interaction: ChatInputCommandInteraction,
  monster: IMonsterModel,
  pokemonData: Pokemon
): Promise<void> {
  const originalName = getPokemonDisplayName(pokemonData);
  const sprites = getPokemonSprites(pokemonData, Boolean(monster.shiny));
  const shinyIcon = monster.shiny ? ' ⭐' : '';

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Current Pokémon Information`)
    .setDescription(
      `**Level ${monster.level} ${originalName}**${shinyIcon}`
    )
    .addFields(
      { name: 'Original Name', value: originalName, inline: true },
      {
        name: 'Current Nickname',
        value: monster.nickname ? `"${monster.nickname}"` : 'None',
        inline: true
      },
      { name: 'Pokémon ID', value: monster.id.toString(), inline: true }
    )
    .setThumbnail(sprites.artwork || sprites.default || '')
    .setColor(monster.shiny ? 0xFFD700 : 0x3498DB)
    .setTimestamp();

  if (monster.nickname) {
    embed.setFooter({ text: 'Use /nickname remove to remove the current nickname' });
  } else {
    embed.setFooter({ text: 'Use /nickname set to give this Pokémon a nickname' });
  }

  await interaction.channel?.send({ embeds: [embed] });
}

/**
 * Get nickname validation rules for display
 * @returns String with validation rules
 */
export function getNicknameRules(): string {
  return `**Nickname Rules:**
• Must be ${MIN_NICKNAME_LENGTH}-${MAX_NICKNAME_LENGTH} characters long
• Must contain at least one letter
• Cannot contain inappropriate content or profanity
• Cannot contain links, mentions, or special Discord formatting
• Cannot contain only numbers or special characters
• Will be automatically sanitized for safety`;
}

/**
 * Batch update nicknames (admin function)
 * @param updates - Array of {monsterId, nickname} objects
 * @returns Success count
 */
export async function batchUpdateNicknames(
  updates: Array<{ monsterId: number; nickname: string }>
): Promise<number> {
  let successCount = 0;

  for (const update of updates) {
    try {
      const sanitized = sanitizeNickname(update.nickname);
      if (!sanitized) continue;

      const result = await databaseClient<IMonsterModel>(MonsterTable)
        .where('id', update.monsterId)
        .update({
          nickname: sanitized,
          nickname_set_at: Date.now().toString()
        });

      if (result) successCount++;
    } catch (error) {
      logger.error(`Error updating nickname for monster ${update.monsterId}:`, error);
    }
  }

  return successCount;
}

// Export utility functions and constants for testing
export {
    INAPPROPRIATE_PATTERNS, isNicknameUniqueForUser,
    MAX_NICKNAME_LENGTH,
    MIN_NICKNAME_LENGTH,
    PROFANITY_LIST, sanitizeNickname
};

