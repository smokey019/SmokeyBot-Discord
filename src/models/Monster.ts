export const MonsterTable = 'smokemon_monsters';

export interface IMonsterModel {
  id?: number;
  monster_id: number;
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
  nature: string;
  experience: number;
  level: number;
  /** Discord ID of the User that caught the monster. */
  uid: string;
  original_uid: string;
  shiny: 0 | 1;
  captured_at: number;
  released?: 0 | 1;
  favorite?: 0 | 1;
  held_item?: number | null;
  nickname?: string;
}
