export const MonsterMovesTable = "monster_moves";

export interface IMonsterMovesModel {
  id?: number;
  /** FK to monsters.id */
  monster_db_id: number;
  /** PokeAPI move ID */
  move_id: number;
  /** Move slot (1-4) */
  slot: number;
  /** Current PP remaining */
  pp_remaining: number;
  /** Maximum PP for this move */
  pp_max: number;
}
