export const GuildSettingsTable = 'guild_settings';

export interface IGuildSettingsModel {
  id: number;
  guild_id: number;
  smokemon_enabled: number;
  specific_channe: string;
}
