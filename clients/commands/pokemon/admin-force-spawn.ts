import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
  type ChatInputCommandInteraction
} from 'discord.js';
import type { runEvent } from '..';
import { forceSpawn } from '../../pokemon/spawn-monster';

/**
 * Configuration for admin users and permissions
 */
const ADMIN_CONFIG = {
  // Primary admin user ID - consider moving to environment variables
  PRIMARY_ADMIN_ID: '90514165138989056',

  // Alternative: Use Discord permissions instead of hardcoded IDs
  REQUIRED_PERMISSIONS: [PermissionFlagsBits.Administrator],

  // Whether to use permission-based checking vs hardcoded ID
  USE_PERMISSION_CHECK: false, // Set to true for more flexible admin checking
} as const;

/**
 * run function with improved Discord.js 14.20+ compatibility
 */
export async function run(e: runEvent): Promise<void> {
  try {
    // Type-safe channel validation
    if (!e.interaction.channel || e.interaction.channel.type !== ChannelType.GuildText) {
      await e.interaction.reply({
        content: '❌ This command can only be used in guild text channels.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const channel = e.interaction.channel as TextChannel;
    const channelName = channel.name;

    // Validate smokemon settings
    if (!e.cache.settings.smokemon_enabled) {
      await e.interaction.reply({
        content: '❌ Smokemon system is currently disabled.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Validate channel restriction
    if (channelName !== e.cache.settings.specific_channel) {
      await e.interaction.reply({
        content: `❌ This command can only be used in #${e.cache.settings.specific_channel}.`,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // admin validation with fallback compatibility
    const isAuthorized = await validateAdminAccess(e.interaction);

    if (!isAuthorized) {
      await e.interaction.reply({
        content: '😠 Unauthorized access. Admin privileges required.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Get Pokemon ID from command options
    const pokemonId = e.interaction.options.getString('pokemon', true);

    if (!pokemonId) {
      await e.interaction.reply({
        content: '❌ Pokemon ID is required.',
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    // Execute force spawn with error handling
    try {
      await forceSpawn(e.interaction, e.cache);

      await e.interaction.reply({
        content: `✅ Successfully force-spawned Pokemon: \`${pokemonId}\``,
        flags: [MessageFlags.Ephemeral]
      });

      // Optional: Log admin action for audit purposes
      console.log(`[ADMIN ACTION] ${e.interaction.user.tag} (${e.interaction.user.id}) force-spawned Pokemon: ${pokemonId} in #${channelName}`);

    } catch (spawnError) {
      console.error('Force spawn error:', spawnError);

      await e.interaction.reply({
        content: `❌ Failed to spawn Pokemon: \`${pokemonId}\`. Check logs for details.`,
        flags: [MessageFlags.Ephemeral]
      });
    }

  } catch (error) {
    console.error('Admin force spawn command error:', error);

    // Fallback error response
    try {
      if (!e.interaction.replied && !e.interaction.deferred) {
        await e.interaction.reply({
          content: '❌ An unexpected error occurred while processing the command.',
          flags: [MessageFlags.Ephemeral]
        });
      }
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}

/**
 * Validates admin access with multiple methods for backwards compatibility
 */
async function validateAdminAccess(interaction: ChatInputCommandInteraction): Promise<boolean> {
  // Primary method: Check hardcoded admin ID (backwards compatible)
  if (interaction.user.id === ADMIN_CONFIG.PRIMARY_ADMIN_ID) {
    return true;
  }

  // Alternative method: Permission-based checking (more flexible)
  if (ADMIN_CONFIG.USE_PERMISSION_CHECK && interaction.guild && interaction.member) {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      return ADMIN_CONFIG.REQUIRED_PERMISSIONS.some(permission =>
        member.permissions.has(permission)
      );
    } catch (error) {
      console.warn('Failed to check member permissions:', error);
      return false;
    }
  }

  return false;
}

/**
 * Command names for registration - maintained for backwards compatibility
 */
export const names = ['fspawn'] as const;

/**
 * slash command definition with Discord.js 14.20+ features
 */
export const SlashCommandData = new SlashCommandBuilder()
  .setName('fspawn')
  .setDescription('🔧 Force spawn a Pokémon - Admin debugging command')
  .addStringOption((option) =>
    option
      .setName('pokemon')
      .setDescription('The Pokémon ID to force spawn')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(50) // Reasonable limit for Pokemon IDs
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Restricts command visibility
  .setDMPermission(false) // Prevents use in DMs

/**
 * Legacy export for backwards compatibility
 * @deprecated Use SlashCommandData instead
 */
export const data = SlashCommandData;