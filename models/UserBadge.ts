export const UserBadgeTable = "user_badges";

export interface IUserBadgeModel {
  id?: number;
  uid: string;
  gym_id: string;
  earned_at?: string;
  attempts: number;
}
