export const TradeTable = `trades`;

export interface ITrade {
  id?: number;
  uid_from?: number;
  uid_to?: number;
  monster_id?: number;
  active?: number;
  traded?: number;
  timestamp?: number;
}
