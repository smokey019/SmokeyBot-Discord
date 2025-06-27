import {
  ChannelType,
  CommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildChannel,
  type TextChannel
} from 'discord.js';
import { cacheClient, type ICache } from '../../clients/cache';
import {
  databaseClient,
  GuildSettingsTable,
  type IGuildSettings
} from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { format_number } from '../../utils';
import { queueMessage } from '../message_queue';

const logger = getLogger('Pokémon-Settings');

// Enhanced error handling
class SettingsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SettingsError";
  }
}

// Constants for better maintainability
const DEFAULT_SPAWN_CHANNEL = 'pokémon-spawns';
const ALTERNATIVE_SPAWN_CHANNELS = ['pokemon-spawns', 'spawns', 'pokemon'];
const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles
];

// Settings configuration with validation rules
interface SettingConfig {
  key: keyof IGuildSettings;
  displayName: string;
  description: string;
  type: 'boolean' | 'number' | 'string' | 'channel';
  defaultValue: any;
  validation?: {
    min?: number;
    max?: number;
    allowedValues?: any[];
    required?: boolean;
  };
  requiresChannel?: boolean;
  adminOnly?: boolean;
}

// Available settings configuration
const SETTINGS_CONFIG: Record<string, SettingConfig> = {
  smokemon: {
    key: 'smokemon_enabled',
    displayName: 'SmokeMon System',
    description: 'Enable/disable the Pokémon spawning and catching system',
    type: 'boolean',
    defaultValue: false,
    requiresChannel: true,
    adminOnly: true,
  },
  spawnChannel: {
    key: 'specific_channel',
    displayName: 'Spawn Channel',
    description: 'Channel where Pokémon will spawn',
    type: 'string',
    defaultValue: DEFAULT_SPAWN_CHANNEL,
    adminOnly: true,
  },
  announcements: {
    key: 'announcements_enabled',
    displayName: 'Announcements',
    description: 'Enable bot announcements and updates',
    type: 'boolean',
    defaultValue: true,
    adminOnly: false,
  }
};

/**
 * Main settings command handler
 * @param interaction - Discord command interaction
 */
export async function handleSettings(interaction: CommandInteraction): Promise<void> {
  try {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'view':
        await viewSettings(interaction);
        break;
      case 'set':
        await setSetting(interaction);
        break;
      case 'reset':
        await resetSetting(interaction);
        break;
      case 'channel':
        await setSpawnChannel(interaction);
        break;
      default:
        await queueMessage("Unknown settings command.", interaction, true);
    }
  } catch (error) {
    logger.error('Error in handleSettings:', error);
    await queueMessage(
      "An error occurred while managing settings. Please try again.",
      interaction,
      true
    );
  }
}

/**
 * Enhanced SmokeMon toggle with comprehensive validation
 * @param interaction - Discord command interaction
 * @param cache - Guild cache
 */
export async function toggleSmokeMon(
  interaction: CommandInteraction,
  cache: ICache,
): Promise<boolean> {
  try {
    // Validate permissions
    if (!hasAdminPermissions(interaction)) {
      await queueMessage(
        "❌ You need Administrator permissions to toggle SmokeMon.",
        interaction,
        true
      );
      return false;
    }

    const toggle = interaction.options.get('toggle')?.value as boolean;

    if (toggle === undefined) {
      await queueMessage(
        "❌ Please specify whether to enable or disable SmokeMon.",
        interaction,
        true
      );
      return false;
    }

    // If enabling, validate spawn channel exists and has proper permissions
    if (toggle) {
      const channelValidation = await validateSpawnChannel(interaction, cache);
      if (!channelValidation.valid) {
        await queueMessage(channelValidation.message, interaction, true);
        return false;
      }
    }

    // Update database
    const updateResult = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .where({ guild_id: interaction.guild!.id })
      .update({ smokemon_enabled: toggle ? 1 : 0 });

    if (!updateResult) {
      throw new SettingsError("Database update failed", "UPDATE_FAILED");
    }

    // Update cache
    cache.settings.smokemon_enabled = toggle ? 1 : 0;
    cacheClient.set(interaction.guild!.id, cache);

    // Log and respond
    const action = toggle ? 'enabled' : 'disabled';
    logger.info(`SmokeMon ${action} in ${interaction.guild!.name} | ${interaction.guild!.id}`);

    const message = toggle
      ? `✅ **SmokeMon enabled!** 🔥\n\n` +
      `Pokémon will now spawn in <#${cache.settings.specific_channel}>!\n\n` +
      `*This plugin is for fun and SmokeyBot does not own the rights to any images/data. ` +
      `Images and data are copyrighted by the Pokémon Company and its affiliates.*`
      : `✅ **SmokeMon disabled!** Pokémon spawning has been turned off.`;

    await queueMessage(message, interaction, true);
    return true;
  } catch (error) {
    logger.error(`Error toggling SmokeMon in guild ${interaction.guild?.id}:`, error);
    await queueMessage(
      "❌ An error occurred while toggling SmokeMon. Please try again.",
      interaction,
      true
    );
    return false;
  }
}

/**
 * View all current guild settings
 * @param interaction - Discord command interaction
 */
async function viewSettings(interaction: CommandInteraction): Promise<void> {
  try {
    const cache = await getGuildCache(interaction.guild!.id);
    if (!cache) {
      await queueMessage("❌ Could not retrieve guild settings.", interaction, true);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚙️ ${interaction.guild!.name} Settings`)
      .setDescription('Current SmokeyBot configuration for this server')
      .setColor(0x3498DB)
      .setTimestamp();

    // Add setting fields
    for (const [key, config] of Object.entries(SETTINGS_CONFIG)) {
      const value = cache.settings[config.key];
      let displayValue: string;

      switch (config.type) {
        case 'boolean':
          displayValue = value ? '✅ Enabled' : '❌ Disabled';
          break;
        case 'number':
          displayValue = format_number(value) || config.defaultValue.toString();
          break;
        case 'string':
          if (config.key === 'specific_channel') {
            const channel = interaction.guild!.channels.cache.get(value);
            displayValue = channel ? `<#${value}>` : `${value} (not found)`;
          } else {
            displayValue = value || 'Not set';
          }
          break;
        default:
          displayValue = value?.toString() || 'Not set';
      }

      embed.addFields({
        name: config.displayName,
        value: `${displayValue}\n*${config.description}*`,
        inline: true
      });
    }

    // Add channel permissions status
    const channelValidation = await validateSpawnChannel(interaction, cache);
    embed.addFields({
      name: '🔧 Spawn Channel Status',
      value: channelValidation.valid ? '✅ Ready' : '❌ Issues detected',
      inline: true
    });

    await interaction.channel?.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Error viewing settings:', error);
    await queueMessage("❌ Error retrieving settings.", interaction, true);
  }
}

/**
 * Set a specific setting value
 * @param interaction - Discord command interaction
 */
async function setSetting(interaction: CommandInteraction): Promise<void> {
  try {
    if (!hasAdminPermissions(interaction)) {
      await queueMessage(
        "❌ You need Administrator permissions to change settings.",
        interaction,
        true
      );
      return;
    }

    const settingName = interaction.options.get('setting')?.value as string;
    const newValue = interaction.options.get('value')?.value;

    const config = SETTINGS_CONFIG[settingName];
    if (!config) {
      await queueMessage(
        `❌ Unknown setting: **${settingName}**\n\n` +
        `Available settings: ${Object.keys(SETTINGS_CONFIG).join(', ')}`,
        interaction,
        true
      );
      return;
    }

    // Validate value
    const validation = validateSettingValue(newValue, config);
    if (!validation.valid) {
      await queueMessage(`❌ ${validation.message}`, interaction, true);
      return;
    }

    // Update database
    const updateData: Partial<Record<keyof IGuildSettings, any>> = {};
    updateData[config.key] = validation.value;

    const updateResult = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .where({ guild_id: interaction.guild!.id })
      .update(updateData);

    if (!updateResult) {
      throw new SettingsError("Database update failed", "UPDATE_FAILED");
    }

    // Update cache
    const cache = await getGuildCache(interaction.guild!.id);
    if (cache) {
      cache.settings[config.key] = validation.value;
      cacheClient.set(interaction.guild!.id, cache);
    }

    await queueMessage(
      `✅ **${config.displayName}** updated to: **${validation.displayValue}**`,
      interaction,
      true
    );

    logger.info(
      `Setting ${settingName} updated to ${validation.value} in guild ${interaction.guild!.id}`
    );
  } catch (error) {
    logger.error('Error setting value:', error);
    await queueMessage("❌ Error updating setting.", interaction, true);
  }
}

/**
 * Reset a setting to its default value
 * @param interaction - Discord command interaction
 */
async function resetSetting(interaction: CommandInteraction): Promise<void> {
  try {
    if (!hasAdminPermissions(interaction)) {
      await queueMessage(
        "❌ You need Administrator permissions to reset settings.",
        interaction,
        true
      );
      return;
    }

    const settingName = interaction.options.get('setting')?.value as string;
    const config = SETTINGS_CONFIG[settingName];

    if (!config) {
      await queueMessage(`❌ Unknown setting: **${settingName}**`, interaction, true);
      return;
    }

    // Update database with default value
    const updateData: Partial<IGuildSettings> = {};
    updateData[config.key] = config.defaultValue;

    const updateResult = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .where({ guild_id: interaction.guild!.id })
      .update(updateData);

    if (!updateResult) {
      throw new SettingsError("Database update failed", "UPDATE_FAILED");
    }

    // Update cache
    const cache = await getGuildCache(interaction.guild!.id);
    if (cache) {
      cache.settings[config.key] = config.defaultValue;
      cacheClient.set(interaction.guild!.id, cache);
    }

    await queueMessage(
      `✅ **${config.displayName}** reset to default: **${config.defaultValue}**`,
      interaction,
      true
    );

    logger.info(
      `Setting ${settingName} reset to default in guild ${interaction.guild!.id}`
    );
  } catch (error) {
    logger.error('Error resetting setting:', error);
    await queueMessage("❌ Error resetting setting.", interaction, true);
  }
}

/**
 * Set or change the spawn channel
 * @param interaction - Discord command interaction
 */
async function setSpawnChannel(interaction: CommandInteraction): Promise<void> {
  try {
    if (!hasAdminPermissions(interaction)) {
      await queueMessage(
        "❌ You need Administrator permissions to change the spawn channel.",
        interaction,
        true
      );
      return;
    }

    const channelOption = interaction.options.get('channel');
    const channel = channelOption?.channel as GuildChannel;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await queueMessage(
        "❌ Please specify a valid text channel.",
        interaction,
        true
      );
      return;
    }

    // Validate bot permissions in the channel
    const textChannel = channel as TextChannel;
    const botPermissions = textChannel.permissionsFor(interaction.client.user!);

    if (!botPermissions?.has(REQUIRED_PERMISSIONS)) {
      await queueMessage(
        `❌ I don't have the required permissions in ${channel}.\n` +
        `Please ensure I can: Send Messages, View Channel, Embed Links, and Attach Files.`,
        interaction,
        true
      );
      return;
    }

    // Update database
    const updateResult = await databaseClient<IGuildSettings>(GuildSettingsTable)
      .where({ guild_id: interaction.guild!.id })
      .update({ specific_channel: channel.id });

    if (!updateResult) {
      throw new SettingsError("Database update failed", "UPDATE_FAILED");
    }

    // Update cache
    const cache = await getGuildCache(interaction.guild!.id);
    if (cache) {
      cache.settings.specific_channel = channel.id;
      cacheClient.set(interaction.guild!.id, cache);
    }

    await queueMessage(
      `✅ **Spawn channel** updated to: ${channel}\n\n` +
      `Pokémon will now spawn in this channel when SmokeMon is enabled.`,
      interaction,
      true
    );

    logger.info(
      `Spawn channel updated to ${channel.id} in guild ${interaction.guild!.id}`
    );
  } catch (error) {
    logger.error('Error setting spawn channel:', error);
    await queueMessage("❌ Error updating spawn channel.", interaction, true);
  }
}

/**
 * Validate spawn channel exists and has proper permissions
 * @param interaction - Discord command interaction
 * @param cache - Guild cache
 * @returns Validation result
 */
async function validateSpawnChannel(
  interaction: CommandInteraction,
  cache: ICache
): Promise<{ valid: boolean; message: string }> {
  const channelId = cache.settings.specific_channel;

  if (!channelId) {
    return {
      valid: false,
      message: `❌ No spawn channel configured. Use \`/settings channel\` to set one.`
    };
  }

  const channel = interaction.guild!.channels.cache.get(channelId) as TextChannel;

  if (!channel) {
    // Try to find alternative channels
    const alternatives = ALTERNATIVE_SPAWN_CHANNELS
      .map(name => interaction.guild!.channels.cache.find(ch => ch.name === name))
      .filter(Boolean);

    if (alternatives.length > 0) {
      return {
        valid: false,
        message: `❌ Spawn channel not found, but I found these alternatives: ${alternatives.map(ch => `<#${ch!.id}>`).join(', ')}\n` +
          `Use \`/settings channel\` to update the spawn channel.`
      };
    }

    return {
      valid: false,
      message: `❌ Spawn channel not found. Please create a channel named \`${DEFAULT_SPAWN_CHANNEL}\` ` +
        `or use \`/settings channel\` to set a different one.`
    };
  }

  const botPermissions = channel.permissionsFor(interaction.client.user!);

  if (!botPermissions?.has(REQUIRED_PERMISSIONS)) {
    const missingPerms = REQUIRED_PERMISSIONS
      .filter(perm => !botPermissions?.has(perm))
      .map(perm => perm.toString());

    return {
      valid: false,
      message: `❌ Missing permissions in ${channel}. Required: ${missingPerms.join(', ')}`
    };
  }

  return { valid: true, message: '' };
}

/**
 * Validate setting value against its configuration
 * @param value - Raw value from user input
 * @param config - Setting configuration
 * @returns Validation result
 */
function validateSettingValue(
  value: any,
  config: SettingConfig
): { valid: boolean; message: string; value?: any; displayValue?: string } {
  if (value === null || value === undefined) {
    return { valid: false, message: "Value is required." };
  }

  switch (config.type) {
    case 'boolean':
      const boolValue = Boolean(value);
      return {
        valid: true,
        value: boolValue ? 1 : 0,
        displayValue: boolValue ? 'Enabled' : 'Disabled',
        message: ''
      };

    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return { valid: false, message: "Value must be a number." };
      }

      if (config.validation?.min !== undefined && numValue < config.validation.min) {
        return {
          valid: false,
          message: `Value must be at least ${config.validation.min}.`
        };
      }

      if (config.validation?.max !== undefined && numValue > config.validation.max) {
        return {
          valid: false,
          message: `Value must be at most ${config.validation.max}.`
        };
      }

      return {
        valid: true,
        value: numValue,
        displayValue: numValue.toString(),
        message: ''
      };

    case 'string':
      const strValue = String(value).trim();
      if (!strValue && config.validation?.required) {
        return { valid: false, message: "Value cannot be empty." };
      }

      return {
        valid: true,
        value: strValue,
        displayValue: strValue,
        message: ''
      };

    default:
      return {
        valid: true,
        value,
        displayValue: String(value),
        message: ''
      };
  }
}

/**
 * Check if user has admin permissions
 * @param interaction - Discord command interaction
 * @returns Whether user has admin permissions
 */
function hasAdminPermissions(interaction: CommandInteraction): boolean {
  if (!interaction.guild || !interaction.member) return false;

  const member = interaction.member;
  return member.permissions instanceof Array
    ? false // Slash commands should provide GuildMemberRoleManager
    : member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Get guild cache safely
 * @param guildId - Guild ID
 * @returns Guild cache or null
 */
async function getGuildCache(guildId: string): Promise<ICache | null> {
  try {
    return await cacheClient.get(guildId);
  } catch (error) {
    logger.error(`Error getting cache for guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Export all available settings for help
 * @returns Settings help information
 */
export function getSettingsHelp(): string {
  return Object.entries(SETTINGS_CONFIG)
    .map(([key, config]) => {
      let help = `**${key}** - ${config.description}`;
      if (config.validation) {
        if (config.validation.min !== undefined || config.validation.max !== undefined) {
          help += ` (${config.validation.min || 0}-${config.validation.max || '∞'})`;
        }
      }
      if (config.adminOnly) {
        help += ' *(Admin only)*';
      }
      return help;
    })
    .join('\n');
}

// Export utility functions and types for testing
export {
  ALTERNATIVE_SPAWN_CHANNELS, DEFAULT_SPAWN_CHANNEL, getGuildCache, hasAdminPermissions, SETTINGS_CONFIG, validateSettingValue, validateSpawnChannel, type SettingConfig
};

