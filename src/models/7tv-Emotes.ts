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

export interface SevenTVChannel {
  id: number;
  platform: string;
  username: string;
  display_name: string;
  linked_at: number;
  emote_capacity: number;
  emote_set_id: number;
  emote_set: {
    id: string;
    name: string;
    flags: number;
    tags: [];
    immutable: false;
    privileged: false;
    emotes: [SevenTVChannelEmotes];
    emote_count: number;
    capacity: number;
    owner: {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string;
      style: {
        color: number;
      };
      roles: [];
    };
  };
  user: {
    id: string;
    username: string;
    display_name: string;
    created_at: number;
    avatar_url: string;
    biography: string;
    style: {
      color: number;
    };
    emote_sets: [];
    editors: [];
    roles: [];
    connections: [];
  };
}

export interface SevenTVChannelEmotes {
  id: string;
  name: string;
  flags: number;
  timestamp: number;
  actor_id: null;
  data: {
    id: string;
    name: string;
    flags: number;
    lifecycle: number;
    state: [];
    listed: true;
    animated: false;
    owner: {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string;
      style: unknown;
      roles: [];
    };
    host: {
      url: string;
      files: any;
    };
  };
}

export interface SevenTVEmoteFile {
  name: string;
  static_name: string;
  width: number;
  height: number;
  frame_count: number;
  size: number;
  format: string;
}
