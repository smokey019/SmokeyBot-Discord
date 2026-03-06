export const BattleLogTable = "battle_log";

export type BattleType = "pvp" | "wild" | "npc" | "gym";
export type BattleEndReason = "faint" | "forfeit" | "timeout";

export interface IBattleLogModel {
  id?: number;
  guild_id: string;
  player1_uid: string;
  player2_uid: string;
  player1_monster_id: number;
  player2_monster_id: number;
  winner_uid: string | null;
  battle_type: BattleType;
  end_reason: BattleEndReason;
  turns: number;
  xp_awarded_winner: number;
  xp_awarded_loser: number;
  currency_awarded_winner: number;
  currency_awarded_loser: number;
  created_at?: string;
}
