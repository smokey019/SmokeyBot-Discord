export const BattleTeamTable = "battle_teams";

export interface IBattleTeamModel {
  id?: number;
  /** Discord user ID */
  uid: string;
  /** Team position (1-6) */
  slot: number;
  /** FK to monsters.id */
  monster_db_id: number;
}
