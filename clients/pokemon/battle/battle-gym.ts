/**
 * Gym system: 8 type-themed gyms with progressive difficulty, badge collection.
 * Gym definitions live in code; only badge progress is stored in DB.
 * Uses Hard/Elite AI and optimized movesets.
 */

import {
  EmbedBuilder,
} from "discord.js";
import { databaseClient } from "../../database";
import { getLogger } from "../../logger";
import { UserBadgeTable, type IUserBadgeModel } from "../../../models/UserBadge";
import type { NpcDifficulty } from "./battle-npc";
import { buildNpcTeam, type NpcTrainerDef } from "./battle-npc";
import type { BattlePokemon } from "./battle-state";

const logger = getLogger("BattleGym");

// ─── Gym Definitions ─────────────────────────────────────────────────────────

export interface GymDef {
  id: string;
  order: number;
  name: string;
  badgeName: string;
  badgeEmoji: string;
  gymType: string;
  leaderName: string;
  leaderTitle: string;
  difficulty: NpcDifficulty;
  description: string;
  /** The leader's team, defined the same way as NPC trainers */
  team: Array<{ speciesId: number; level: number }>;
  rewardCurrency: number;
  rewardXpMultiplier: number;
  /** Cooldown in minutes after a LOSS before the player can retry */
  retryCooldownMinutes: number;
}

/**
 * All 8 gyms in order. Levels scale from ~15 to ~100.
 * Leaders use Hard or Elite AI and have type coverage to counter weaknesses.
 */
export const GYMS: GymDef[] = [
  // ── Gym 1: Rock ──
  {
    id: "gym_rock",
    order: 1,
    name: "Pewter City Gym",
    badgeName: "Boulder Badge",
    badgeEmoji: "\u{1F48E}",  // 💎
    gymType: "rock",
    leaderName: "Brock",
    leaderTitle: "Rock-Type Leader",
    difficulty: "hard",
    description: "The stone-solid Rock-type Gym. Tests basic type matchup knowledge.",
    team: [
      { speciesId: 74, level: 14 },   // Geodude
      { speciesId: 95, level: 16 },    // Onix
      { speciesId: 299, level: 17 },   // Nosepass
      { speciesId: 76, level: 18 },    // Golem
    ],
    rewardCurrency: 500,
    rewardXpMultiplier: 2.0,
    retryCooldownMinutes: 30,
  },

  // ── Gym 2: Water ──
  {
    id: "gym_water",
    order: 2,
    name: "Cerulean City Gym",
    badgeName: "Cascade Badge",
    badgeEmoji: "\u{1F4A7}",  // 💧
    gymType: "water",
    leaderName: "Misty",
    leaderTitle: "Water-Type Leader",
    difficulty: "hard",
    description: "The tomboyish mermaid's domain. Varied Water-types with move coverage.",
    team: [
      { speciesId: 121, level: 27 },   // Starmie
      { speciesId: 130, level: 28 },   // Gyarados
      { speciesId: 55, level: 26 },    // Golduck
      { speciesId: 91, level: 29 },    // Cloyster
      { speciesId: 131, level: 30 },   // Lapras
    ],
    rewardCurrency: 750,
    rewardXpMultiplier: 2.0,
    retryCooldownMinutes: 30,
  },

  // ── Gym 3: Electric ──
  {
    id: "gym_electric",
    order: 3,
    name: "Vermilion City Gym",
    badgeName: "Thunder Badge",
    badgeEmoji: "\u26A1",  // ⚡
    gymType: "electric",
    leaderName: "Lt. Surge",
    leaderTitle: "Electric-Type Leader",
    difficulty: "hard",
    description: "The Lightning American! Speed-focused Electric-types.",
    team: [
      { speciesId: 26, level: 36 },    // Raichu
      { speciesId: 101, level: 37 },   // Electrode
      { speciesId: 82, level: 38 },    // Magneton
      { speciesId: 135, level: 38 },   // Jolteon
      { speciesId: 125, level: 40 },   // Electabuzz
    ],
    rewardCurrency: 1000,
    rewardXpMultiplier: 2.5,
    retryCooldownMinutes: 45,
  },

  // ── Gym 4: Grass ──
  {
    id: "gym_grass",
    order: 4,
    name: "Celadon City Gym",
    badgeName: "Rainbow Badge",
    badgeEmoji: "\u{1F33F}",  // 🌿
    gymType: "grass",
    leaderName: "Erika",
    leaderTitle: "Grass-Type Leader",
    difficulty: "hard",
    description: "The nature-loving princess. Status moves and stalling tactics.",
    team: [
      { speciesId: 45, level: 46 },    // Vileplume
      { speciesId: 71, level: 47 },    // Victreebel
      { speciesId: 103, level: 48 },   // Exeggutor
      { speciesId: 114, level: 47 },   // Tangela
      { speciesId: 3, level: 50 },     // Venusaur
    ],
    rewardCurrency: 1250,
    rewardXpMultiplier: 2.5,
    retryCooldownMinutes: 45,
  },

  // ── Gym 5: Fire ──
  {
    id: "gym_fire",
    order: 5,
    name: "Cinnabar Island Gym",
    badgeName: "Volcano Badge",
    badgeEmoji: "\u{1F525}",  // 🔥
    gymType: "fire",
    leaderName: "Blaine",
    leaderTitle: "Fire-Type Leader",
    difficulty: "elite",
    description: "The hotheaded quiz master. High attack power with type coverage.",
    team: [
      { speciesId: 59, level: 56 },    // Arcanine
      { speciesId: 78, level: 57 },    // Rapidash
      { speciesId: 126, level: 58 },   // Magmar
      { speciesId: 6, level: 59 },     // Charizard
      { speciesId: 38, level: 57 },    // Ninetales
      { speciesId: 136, level: 60 },   // Flareon
    ],
    rewardCurrency: 1500,
    rewardXpMultiplier: 3.0,
    retryCooldownMinutes: 60,
  },

  // ── Gym 6: Psychic ──
  {
    id: "gym_psychic",
    order: 6,
    name: "Saffron City Gym",
    badgeName: "Marsh Badge",
    badgeEmoji: "\u{1F52E}",  // 🔮
    gymType: "psychic",
    leaderName: "Sabrina",
    leaderTitle: "Psychic-Type Leader",
    difficulty: "elite",
    description: "The master of psychic Pokemon. Sp.Atk focused with tricky matchups.",
    team: [
      { speciesId: 65, level: 67 },    // Alakazam
      { speciesId: 97, level: 66 },    // Hypno
      { speciesId: 122, level: 68 },   // Mr. Mime
      { speciesId: 80, level: 67 },    // Slowbro
      { speciesId: 124, level: 68 },   // Jynx
      { speciesId: 150, level: 70 },   // Mewtwo
    ],
    rewardCurrency: 2000,
    rewardXpMultiplier: 3.0,
    retryCooldownMinutes: 60,
  },

  // ── Gym 7: Dragon ──
  {
    id: "gym_dragon",
    order: 7,
    name: "Blackthorn City Gym",
    badgeName: "Rising Badge",
    badgeEmoji: "\u{1F409}",  // 🐉
    gymType: "dragon",
    leaderName: "Clair",
    leaderTitle: "Dragon-Type Leader",
    difficulty: "elite",
    description: "The blessed user of Dragon-types. High base stats and multiple resistances.",
    team: [
      { speciesId: 149, level: 78 },   // Dragonite
      { speciesId: 148, level: 76 },   // Dragonair
      { speciesId: 130, level: 77 },   // Gyarados
      { speciesId: 142, level: 78 },   // Aerodactyl
      { speciesId: 6, level: 80 },     // Charizard
      { speciesId: 445, level: 82 },   // Garchomp
    ],
    rewardCurrency: 2500,
    rewardXpMultiplier: 3.5,
    retryCooldownMinutes: 90,
  },

  // ── Gym 8: Mixed (Champion-tier) ──
  {
    id: "gym_champion",
    order: 8,
    name: "Indigo Plateau Gym",
    badgeName: "Champion Badge",
    badgeEmoji: "\u{1F451}",  // 👑
    gymType: "mixed",
    leaderName: "Lance",
    leaderTitle: "Pokemon Champion",
    difficulty: "elite",
    description: "The ultimate challenge. The Champion awaits with a team of legends.",
    team: [
      { speciesId: 149, level: 92 },   // Dragonite
      { speciesId: 130, level: 90 },   // Gyarados
      { speciesId: 142, level: 91 },   // Aerodactyl
      { speciesId: 6, level: 93 },     // Charizard
      { speciesId: 131, level: 92 },   // Lapras
      { speciesId: 248, level: 95 },   // Tyranitar
    ],
    rewardCurrency: 5000,
    rewardXpMultiplier: 4.0,
    retryCooldownMinutes: 120,
  },
];

// ─── Gym Lookup Helpers ──────────────────────────────────────────────────────

/**
 * Get a gym definition by ID.
 */
export function getGymById(gymId: string): GymDef | undefined {
  return GYMS.find((g) => g.id === gymId);
}

/**
 * Get a gym by its order number (1-8).
 */
export function getGymByOrder(order: number): GymDef | undefined {
  return GYMS.find((g) => g.order === order);
}

/**
 * Build the gym leader's team as BattlePokemon[].
 * Reuses the NPC team builder since gym leaders have the same data shape.
 */
export async function buildGymTeam(gym: GymDef): Promise<BattlePokemon[]> {
  // Convert to NpcTrainerDef-like shape for buildNpcTeam
  const fakeTrainer: NpcTrainerDef = {
    id: gym.id,
    name: gym.leaderName,
    title: gym.leaderTitle,
    difficulty: gym.difficulty,
    team: gym.team,
    rewardCurrency: gym.rewardCurrency,
    rewardXpMultiplier: gym.rewardXpMultiplier,
    cooldownMinutes: gym.retryCooldownMinutes,
    description: gym.description,
  };
  return buildNpcTeam(fakeTrainer);
}

// ─── Badge Tracking ──────────────────────────────────────────────────────────

/**
 * Get all badges earned by a user.
 */
export async function getUserBadges(userId: string): Promise<IUserBadgeModel[]> {
  try {
    return await databaseClient<IUserBadgeModel>(UserBadgeTable)
      .select()
      .where("uid", userId);
  } catch (error) {
    logger.error(`Error fetching badges for ${userId}:`, error);
    return [];
  }
}

/**
 * Check if a user has a specific badge.
 */
export async function hasBadge(userId: string, gymId: string): Promise<boolean> {
  try {
    const badge = await databaseClient<IUserBadgeModel>(UserBadgeTable)
      .select()
      .where({ uid: userId, gym_id: gymId })
      .first();
    return !!badge;
  } catch (error) {
    logger.error(`Error checking badge for ${userId}/${gymId}:`, error);
    return false;
  }
}

/**
 * Award a badge to a user. Also increments attempts.
 */
export async function awardBadge(userId: string, gymId: string): Promise<void> {
  try {
    const existing = await databaseClient<IUserBadgeModel>(UserBadgeTable)
      .select()
      .where({ uid: userId, gym_id: gymId })
      .first();

    if (existing) {
      // Already has badge -- just increment attempts (re-challenge)
      await databaseClient<IUserBadgeModel>(UserBadgeTable)
        .where({ uid: userId, gym_id: gymId })
        .increment("attempts", 1);
    } else {
      await databaseClient<IUserBadgeModel>(UserBadgeTable).insert({
        uid: userId,
        gym_id: gymId,
        attempts: 1,
        earned_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error(`Error awarding badge for ${userId}/${gymId}:`, error);
  }
}

/**
 * Record a gym attempt (loss). Increments attempts without awarding badge.
 */
export async function recordGymAttempt(userId: string, gymId: string): Promise<void> {
  try {
    const existing = await databaseClient<IUserBadgeModel>(UserBadgeTable)
      .select()
      .where({ uid: userId, gym_id: gymId })
      .first();

    if (existing) {
      await databaseClient<IUserBadgeModel>(UserBadgeTable)
        .where({ uid: userId, gym_id: gymId })
        .increment("attempts", 1);
    } else {
      // No badge yet -- create a record to track attempts
      await databaseClient<IUserBadgeModel>(UserBadgeTable).insert({
        uid: userId,
        gym_id: gymId,
        attempts: 1,
        earned_at: undefined, // null -- no badge yet
      });
    }
  } catch (error) {
    logger.error(`Error recording gym attempt for ${userId}/${gymId}:`, error);
  }
}

/**
 * Get the number of badges earned (not just attempted) by a user.
 */
export async function getBadgeCount(userId: string): Promise<number> {
  try {
    const badges = await databaseClient<IUserBadgeModel>(UserBadgeTable)
      .select()
      .where("uid", userId)
      .whereNotNull("earned_at");
    return badges.length;
  } catch (error) {
    logger.error(`Error counting badges for ${userId}:`, error);
    return 0;
  }
}

/**
 * Determine the next available gym for a user.
 * Returns the first gym they haven't earned a badge for (in order).
 * If all 8 complete, returns null.
 */
export async function getNextGym(userId: string): Promise<GymDef | null> {
  const badges = await getUserBadges(userId);
  const earnedGymIds = new Set(
    badges.filter((b) => b.earned_at).map((b) => b.gym_id),
  );

  for (const gym of GYMS) {
    if (!earnedGymIds.has(gym.id)) {
      return gym;
    }
  }

  return null; // All gyms completed
}

/**
 * Check if the user can challenge a specific gym (must have beaten all prior gyms).
 */
export async function canChallengeGym(userId: string, gym: GymDef): Promise<{ allowed: boolean; reason?: string }> {
  const badges = await getUserBadges(userId);
  const earnedGymIds = new Set(
    badges.filter((b) => b.earned_at).map((b) => b.gym_id),
  );

  // Check all gyms before this one are complete
  for (const priorGym of GYMS) {
    if (priorGym.order >= gym.order) break;
    if (!earnedGymIds.has(priorGym.id)) {
      return {
        allowed: false,
        reason: `You must defeat **${priorGym.leaderTitle} ${priorGym.leaderName}** at **${priorGym.name}** first! (Gym #${priorGym.order})`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check gym retry cooldown. Only applies after a loss (not after a win).
 * Returns remaining minutes or 0.
 */
export async function getGymCooldown(userId: string, gymId: string, cooldownMinutes: number): Promise<number> {
  try {
    // We use the NPC progress table for gym cooldown tracking
    const { NpcTrainerProgressTable } = await import("../../../models/NpcTrainerProgress");
    const progress = await databaseClient(NpcTrainerProgressTable)
      .select()
      .where({ uid: userId, trainer_id: gymId })
      .first();

    if (!progress?.last_attempt_at) return 0;

    // If user already has the badge, no cooldown
    const badge = await databaseClient<IUserBadgeModel>(UserBadgeTable)
      .select()
      .where({ uid: userId, gym_id: gymId })
      .whereNotNull("earned_at")
      .first();

    if (badge) return 0; // Already beaten, can re-challenge freely

    const lastAttempt = new Date(progress.last_attempt_at).getTime();
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const remaining = (lastAttempt + cooldownMs) - Date.now();

    return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
  } catch (error) {
    logger.error(`Error checking gym cooldown for ${userId}/${gymId}:`, error);
    return 0;
  }
}

// ─── Reward Calculation ──────────────────────────────────────────────────────

/**
 * Calculate gym battle rewards.
 */
export function calculateGymRewards(
  gym: GymDef,
  playerLevel: number,
  halved: boolean,
  firstWin: boolean,
): { xp: number; currency: number } {
  const avgGymLevel = gym.team.reduce((sum, m) => sum + m.level, 0) / gym.team.length;
  let xp = Math.floor(avgGymLevel * 120 * gym.rewardXpMultiplier);
  let currency = gym.rewardCurrency;

  // First-time bonus: 50% extra
  if (firstWin) {
    xp = Math.floor(xp * 1.5);
    currency = Math.floor(currency * 1.5);
  }

  if (halved) {
    xp = Math.floor(xp / 2);
    currency = Math.floor(currency / 2);
  }

  return { xp, currency };
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, number> = {
  rock: 0xb8a038,
  water: 0x6890f0,
  electric: 0xf8d030,
  grass: 0x78c850,
  fire: 0xf08030,
  psychic: 0xf85888,
  dragon: 0x7038f8,
  mixed: 0xa890f0,
};

/**
 * Build the gym list embed showing all 8 gyms with badge status.
 */
export function buildGymListEmbed(userBadges: IUserBadgeModel[]): EmbedBuilder {
  const earnedGymIds = new Set(
    userBadges.filter((b) => b.earned_at).map((b) => b.gym_id),
  );

  const embed = new EmbedBuilder()
    .setTitle("Pokemon Gym Challenge")
    .setDescription("Defeat all 8 Gym Leaders to earn their badges! Gyms must be beaten in order.")
    .setColor(0xffd700)
    .setTimestamp();

  // Badge row at the top
  const badgeRow = GYMS.map((gym) => {
    return earnedGymIds.has(gym.id) ? gym.badgeEmoji : "\u2B1B"; // ⬛ for unearned
  }).join(" ");
  embed.addFields({ name: "Your Badges", value: badgeRow, inline: false });

  for (const gym of GYMS) {
    const earned = earnedGymIds.has(gym.id);
    const statusIcon = earned ? "\u2705" : "\u{1F512}"; // ✅ or 🔒
    const attempts = userBadges.find((b) => b.gym_id === gym.id)?.attempts || 0;
    const teamLevels = gym.team.map((m) => `Lv.${m.level}`).join(", ");

    // Check if unlocked (all prior gyms beaten)
    let locked = false;
    for (const priorGym of GYMS) {
      if (priorGym.order >= gym.order) break;
      if (!earnedGymIds.has(priorGym.id)) {
        locked = true;
        break;
      }
    }

    const lockText = locked ? " *(locked)*" : "";

    embed.addFields({
      name: `${statusIcon} Gym #${gym.order}: ${gym.name}`,
      value: `**${gym.leaderTitle} ${gym.leaderName}** | Type: ${gym.gymType.toUpperCase()}${lockText}\n${gym.team.length} Pokemon (${teamLevels}) | Reward: ${gym.rewardCurrency}c${earned ? `\nAttempts: ${attempts}` : ""}`,
      inline: false,
    });
  }

  return embed;
}

/**
 * Build the badge display embed for a user.
 */
export function buildBadgeEmbed(
  userId: string,
  username: string,
  userBadges: IUserBadgeModel[],
): EmbedBuilder {
  const earnedGymIds = new Set(
    userBadges.filter((b) => b.earned_at).map((b) => b.gym_id),
  );

  const badgeCount = earnedGymIds.size;

  const embed = new EmbedBuilder()
    .setTitle(`${username}'s Gym Badges`)
    .setColor(badgeCount >= 8 ? 0xffd700 : 0x5865f2)
    .setTimestamp();

  // Badge row
  const badgeRow = GYMS.map((gym) => {
    return earnedGymIds.has(gym.id) ? gym.badgeEmoji : "\u2B1B";
  }).join("  ");
  embed.setDescription(badgeRow);

  // Badge details
  const details: string[] = [];
  for (const gym of GYMS) {
    const badge = userBadges.find((b) => b.gym_id === gym.id);
    if (badge?.earned_at) {
      const date = new Date(badge.earned_at).toLocaleDateString();
      details.push(`${gym.badgeEmoji} **${gym.badgeName}** - Earned ${date} (${badge.attempts} attempt${badge.attempts !== 1 ? "s" : ""})`);
    } else {
      details.push(`\u2B1B **${gym.badgeName}** - *Not yet earned*`);
    }
  }

  embed.addFields({
    name: `${badgeCount}/8 Badges`,
    value: details.join("\n"),
    inline: false,
  });

  if (badgeCount >= 8) {
    embed.addFields({
      name: "\u{1F3C6} Champion!",
      value: "You have defeated all 8 Gym Leaders! You are a Pokemon Champion!",
      inline: false,
    });
  }

  return embed;
}

/**
 * Build the gym leaderboard embed.
 */
export async function buildGymLeaderboardEmbed(): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle("Gym Badge Leaderboard")
    .setColor(0xffd700)
    .setTimestamp();

  try {
    // Get top players by badge count
    const results = await databaseClient<IUserBadgeModel>(UserBadgeTable)
      .select("uid")
      .whereNotNull("earned_at")
      .groupBy("uid")
      .orderByRaw("COUNT(*) DESC")
      .limit(15);

    if (results.length === 0) {
      embed.setDescription("No badges earned yet! Be the first to challenge a gym with `/gym challenge`.");
      return embed;
    }

    // For each user, count their badges and get min earned_at
    const leaderboard: Array<{ uid: string; count: number; latest: string }> = [];
    for (const row of results) {
      const badges = await databaseClient<IUserBadgeModel>(UserBadgeTable)
        .select()
        .where({ uid: row.uid })
        .whereNotNull("earned_at");

      const latestBadge = badges.reduce((latest, b) => {
        if (!b.earned_at) return latest;
        return !latest || new Date(b.earned_at) > new Date(latest) ? b.earned_at : latest;
      }, "" as string);

      leaderboard.push({
        uid: row.uid,
        count: badges.length,
        latest: latestBadge,
      });
    }

    // Sort by badge count desc, then by earliest completion
    leaderboard.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(a.latest).getTime() - new Date(b.latest).getTime();
    });

    const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"]; // 🥇🥈🥉
    const lines = leaderboard.map((entry, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const badgeIcons = GYMS.slice(0, entry.count).map((g) => g.badgeEmoji).join("");
      const champion = entry.count >= 8 ? " \u{1F451}" : "";
      return `${medal} <@${entry.uid}> - ${entry.count}/8 badges ${badgeIcons}${champion}`;
    });

    embed.setDescription(lines.join("\n"));
  } catch (error) {
    logger.error("Error building gym leaderboard:", error);
    embed.setDescription("Failed to load leaderboard data.");
  }

  return embed;
}
