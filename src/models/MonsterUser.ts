export const MonsterUserTable = 'smokemon_users';

export interface IMonsterUserModel {
  current_monster: number;
  latest_monster: number;
  /** Discord ID of the User that caught the monster. */
  uid: string;
  currency: number;
  streak: number;
  items: string;
}
