export const NpcTrainerProgressTable = "npc_trainer_progress";

export interface INpcTrainerProgressModel {
  id?: number;
  uid: string;
  trainer_id: string;
  wins: number;
  attempts: number;
  last_attempt_at?: string;
  first_win_at?: string;
}
