export const MonsterUserTable = 'smokemon_users';

export interface IMonsterUserModel {
  id?: number;
  uid?: number;
  currency?: number;
  current_monster?: number;
  latest_monster?: number;
  streak?: number;
  items?: string;
}
