/**
 * Battle rewards: XP, currency, anti-abuse, and battle logging.
 */

import { databaseClient } from "../../database";
import { getLogger } from "../../logger";
import { BATTLE_COOLDOWN } from "../../cache";
import { MonsterTable, type IMonsterModel } from "../../../models/Monster";
import { MonsterUserTable, type IMonsterUserModel } from "../../../models/MonsterUser";
import { BattleLogTable, type IBattleLogModel, type BattleType, type BattleEndReason } from "../../../models/BattleLog";
import type { BattleState } from "./battle-state";

const logger = getLogger("BattleRewards");

const BASE_WINNER_XP = 500;
const WINNER_XP_PER_LEVEL = 100;
const LOSER_XP_PER_LEVEL = 25;
const BASE_WINNER_CURRENCY = 100;
const BASE_LOSER_CURRENCY = 25;
const MAX_LEVEL_DIFF_BONUS = 30;
const LEVEL_DIFF_CURRENCY_PER_LEVEL = 10;
const DAILY_BATTLE_LIMIT = 20;
const COOLDOWN_SECONDS = 300; // 5 minutes

export interface BattleRewards {
  winnerXp: number;
  loserXp: number;
  winnerCurrency: number;
  loserCurrency: number;
  rewardsHalved: boolean;
}

/**
 * Calculate rewards for a battle.
 */
export function calculateRewards(
  winnerLevel: number,
  loserLevel: number,
  rewardsHalved: boolean = false,
): BattleRewards {
  let winnerXp = BASE_WINNER_XP + loserLevel * WINNER_XP_PER_LEVEL;
  let loserXp = winnerLevel * LOSER_XP_PER_LEVEL;

  const levelDiff = Math.min(MAX_LEVEL_DIFF_BONUS, Math.max(0, loserLevel - winnerLevel));
  let winnerCurrency = BASE_WINNER_CURRENCY + levelDiff * LEVEL_DIFF_CURRENCY_PER_LEVEL;
  let loserCurrency = BASE_LOSER_CURRENCY;

  if (rewardsHalved) {
    winnerXp = Math.floor(winnerXp / 2);
    loserXp = Math.floor(loserXp / 2);
    winnerCurrency = Math.floor(winnerCurrency / 2);
    loserCurrency = Math.floor(loserCurrency / 2);
  }

  return { winnerXp, loserXp, winnerCurrency, loserCurrency, rewardsHalved };
}

/**
 * Apply rewards to both players' Pokemon and currency.
 * In team battles, XP is split across all team Pokemon that participated
 * (i.e. were sent out at some point -- tracked by having less than max HP or being fainted).
 * For simplicity, all team members get a share of the XP.
 */
export async function applyRewards(
  battle: BattleState,
  winnerId: string | null,
  rewards: BattleRewards,
): Promise<void> {
  if (!winnerId) return; // Draw -- no rewards

  const loserId = winnerId === battle.player1.userId ? battle.player2.userId : battle.player1.userId;
  const winnerPlayer = winnerId === battle.player1.userId ? battle.player1 : battle.player2;
  const loserPlayer = winnerId === battle.player1.userId ? battle.player2 : battle.player1;

  try {
    // Distribute XP across all team members
    // In team battles, split XP among participants; in 1v1 the single Pokemon gets full XP
    const winnerTeamSize = winnerPlayer.team.length;
    const loserTeamSize = loserPlayer.team.length;

    // Each team member gets a fair share, but at least 1 XP
    const winnerXpPerMon = Math.max(1, Math.floor(rewards.winnerXp / winnerTeamSize));
    const loserXpPerMon = Math.max(1, Math.floor(rewards.loserXp / loserTeamSize));

    // Award XP to all winner's team Pokemon
    for (const pokemon of winnerPlayer.team) {
      await databaseClient<IMonsterModel>(MonsterTable)
        .where("id", pokemon.dbId)
        .increment("experience", winnerXpPerMon);
    }

    // Award XP to all loser's team Pokemon
    for (const pokemon of loserPlayer.team) {
      await databaseClient<IMonsterModel>(MonsterTable)
        .where("id", pokemon.dbId)
        .increment("experience", loserXpPerMon);
    }

    // Award currency to winner
    await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where("uid", winnerId)
      .increment("currency", rewards.winnerCurrency);

    // Award currency to loser
    await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where("uid", loserId)
      .increment("currency", rewards.loserCurrency);

    logger.info(
      `Rewards applied: winner ${winnerId} (${winnerXpPerMon} XP x${winnerTeamSize} Pokemon, +${rewards.winnerCurrency} currency), ` +
        `loser ${loserId} (${loserXpPerMon} XP x${loserTeamSize} Pokemon, +${rewards.loserCurrency} currency)`,
    );
  } catch (error) {
    logger.error("Error applying battle rewards:", error);
  }
}

/**
 * Log a completed battle to the database.
 */
export async function logBattle(
  battle: BattleState,
  winnerId: string | null,
  rewards: BattleRewards,
): Promise<void> {
  try {
    const log: IBattleLogModel = {
      guild_id: battle.guildId,
      player1_uid: battle.player1.userId,
      player2_uid: battle.player2.userId,
      player1_monster_id: battle.player1.pokemon.dbId,
      player2_monster_id: battle.player2.pokemon.dbId,
      winner_uid: winnerId,
      battle_type: battle.battleType,
      end_reason: battle.endReason || "faint",
      turns: battle.turn - 1,
      xp_awarded_winner: rewards.winnerXp,
      xp_awarded_loser: rewards.loserXp,
      currency_awarded_winner: rewards.winnerCurrency,
      currency_awarded_loser: rewards.loserCurrency,
    };

    await databaseClient<IBattleLogModel>(BattleLogTable).insert(log);
  } catch (error) {
    logger.error("Error logging battle:", error);
  }
}

/**
 * Check if two users are on cooldown from battling each other.
 * Returns seconds remaining if on cooldown, 0 if ready.
 */
export function getBattleCooldown(userId1: string, userId2: string): number {
  const key = getBattleCooldownKey(userId1, userId2);
  const cooldownEnd = BATTLE_COOLDOWN.get(key);

  if (!cooldownEnd) return 0;

  const remaining = cooldownEnd - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Set the battle cooldown between two users.
 */
export function setBattleCooldown(userId1: string, userId2: string): void {
  const key = getBattleCooldownKey(userId1, userId2);
  BATTLE_COOLDOWN.set(key, Date.now() + COOLDOWN_SECONDS * 1000);
}

function getBattleCooldownKey(userId1: string, userId2: string): string {
  // Sort IDs so the key is the same regardless of who challenged whom
  const sorted = [userId1, userId2].sort();
  return `battle:${sorted[0]}:${sorted[1]}`;
}

/**
 * Check how many battles a user has had today (for daily limit).
 * Returns true if rewards should be halved.
 */
export async function shouldHalveRewards(userId: string): Promise<boolean> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await databaseClient<IBattleLogModel>(BattleLogTable)
      .count("* as count")
      .where(function () {
        this.where("player1_uid", userId).orWhere("player2_uid", userId);
      })
      .where("created_at", ">=", today.toISOString())
      .first();

    const count = Number((result as any)?.count || 0);
    return count >= DAILY_BATTLE_LIMIT;
  } catch (error) {
    logger.error(`Error checking daily battle count for ${userId}:`, error);
    return false;
  }
}
