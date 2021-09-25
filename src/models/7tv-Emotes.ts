/**
 * 7TV Emote Structure
 */
export interface SevenTVEmotes {
  id: string;
  name: string;
  owner: {
    id?: string;
    twitch_id?: string;
    login?: string;
    display_name?: string;
    role?: {
      id?: string;
      name?: string;
      position?: number;
      color?: number;
      allowed?: number;
      denied?: number;
      default?: boolean;
    };
  };
  visibility: number;
  visibility_simple: [];
  mime: string;
  status: number;
  tags: [];
  width: [number, number, number, number];
  height: [number, number, number, number];
  urls: ['1', string, '2', string, '3', string, '4', string];
}
