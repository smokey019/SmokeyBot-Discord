import type { Guild } from 'discord.js';

/**
 * Minimal interaction context for spawn and weather systems.
 * Both Message and ChatInputCommandInteraction satisfy this interface.
 */
export interface GuildContext {
  guild: Guild | null;
}
