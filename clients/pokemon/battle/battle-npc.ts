/**
 * NPC Trainer battle system.
 * Contains trainer definitions, AI difficulty tiers, team generation, and progress tracking.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { databaseClient } from "../../database";
import { getLogger } from "../../logger";
import { getRndInteger } from "../../../utils";
import { NpcTrainerProgressTable, type INpcTrainerProgressModel } from "../../../models/NpcTrainerProgress";
import { findMonsterByID } from "../monsters";
import { calculateAllStats, getPokemonImages } from "../info";
import { capitalizeFirstLetter } from "../utils";
import { getRandomNature } from "../natures";
import { generatePokemonIVs } from "../monsters";
import type { BattlePokemon, BattleMove } from "./battle-state";
import { defaultStatStages } from "./battle-state";
import { getTypeMultiplier, getStabMultiplier } from "./type-chart";

const logger = getLogger("BattleNPC");

/** NPC user ID prefix */
export const NPC_USER_ID_PREFIX = "npc_";

// ─── AI Difficulty Tiers ─────────────────────────────────────────────────────

export type NpcDifficulty = "easy" | "medium" | "hard" | "elite";

/**
 * Select a move for an NPC based on difficulty tier.
 */
export function selectNpcMove(
  difficulty: NpcDifficulty,
  npcPokemon: BattlePokemon,
  opponentPokemon: BattlePokemon,
): number {
  const moves = npcPokemon.moves;
  const available = moves
    .map((m, i) => ({ move: m, index: i }))
    .filter((m) => m.move.pp > 0);

  if (available.length === 0) return -1; // Struggle

  switch (difficulty) {
    case "easy":
      return easyAI(available);
    case "medium":
      return mediumAI(available, npcPokemon, opponentPokemon);
    case "hard":
      return hardAI(available, npcPokemon, opponentPokemon);
    case "elite":
      return eliteAI(available, npcPokemon, opponentPokemon);
    default:
      return easyAI(available);
  }
}

/** Easy AI: pure random selection */
function easyAI(available: Array<{ move: BattleMove; index: number }>): number {
  return available[getRndInteger(0, available.length - 1)].index;
}

/** Medium AI: prefers super-effective moves */
function mediumAI(
  available: Array<{ move: BattleMove; index: number }>,
  attacker: BattlePokemon,
  defender: BattlePokemon,
): number {
  // 70% chance to pick a super-effective move if one exists
  if (Math.random() < 0.7) {
    const superEffective = available.filter(
      (m) => m.move.power && m.move.power > 0 && getTypeMultiplier(m.move.type, defender.types) > 1,
    );
    if (superEffective.length > 0) {
      return superEffective[getRndInteger(0, superEffective.length - 1)].index;
    }
  }

  // Fall back to random damaging move
  const damaging = available.filter((m) => m.move.power && m.move.power > 0);
  if (damaging.length > 0) {
    return damaging[getRndInteger(0, damaging.length - 1)].index;
  }

  return easyAI(available);
}

/** Hard AI: considers STAB, type effectiveness, and picks highest expected damage */
function hardAI(
  available: Array<{ move: BattleMove; index: number }>,
  attacker: BattlePokemon,
  defender: BattlePokemon,
): number {
  // 85% chance to pick optimally
  if (Math.random() < 0.85) {
    return pickBestDamageMove(available, attacker, defender);
  }
  return mediumAI(available, attacker, defender);
}

/** Elite AI: always picks the highest expected damage move */
function eliteAI(
  available: Array<{ move: BattleMove; index: number }>,
  attacker: BattlePokemon,
  defender: BattlePokemon,
): number {
  return pickBestDamageMove(available, attacker, defender);
}

/** Pick the move with the highest expected damage considering STAB + type effectiveness */
function pickBestDamageMove(
  available: Array<{ move: BattleMove; index: number }>,
  attacker: BattlePokemon,
  defender: BattlePokemon,
): number {
  let bestIndex = available[0].index;
  let bestScore = -1;

  for (const { move, index } of available) {
    if (!move.power || move.power === 0) {
      // Status moves get a small score based on effect chance
      const statusScore = move.statChanges.length > 0 ? 15 : 5;
      if (statusScore > bestScore) {
        bestScore = statusScore;
        bestIndex = index;
      }
      continue;
    }

    const effectiveness = getTypeMultiplier(move.type, defender.types);
    const stab = getStabMultiplier(move.type, attacker.types);
    const score = move.power * effectiveness * stab;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

// ─── NPC Trainer Definitions ─────────────────────────────────────────────────

export interface NpcTrainerTeamMember {
  speciesId: number;
  level: number;
}

export interface NpcTrainerDef {
  id: string;
  name: string;
  title: string;
  difficulty: NpcDifficulty;
  team: NpcTrainerTeamMember[];
  rewardCurrency: number;
  rewardXpMultiplier: number;
  cooldownMinutes: number;
  description: string;
}

/**
 * All NPC Trainers. Organized by difficulty tier.
 * Species IDs are Pokedex numbers. Moves are auto-generated from level-up moves.
 */
export const NPC_TRAINERS: NpcTrainerDef[] = [
  // ── Easy Trainers ──
  {
    id: "bugcatcher_billy",
    name: "Billy",
    title: "Bug Catcher",
    difficulty: "easy",
    team: [
      { speciesId: 10, level: 8 },   // Caterpie
      { speciesId: 13, level: 10 },   // Weedle
    ],
    rewardCurrency: 150,
    rewardXpMultiplier: 1.0,
    cooldownMinutes: 15,
    description: "A young bug catcher with basic Pokemon.",
  },
  {
    id: "youngster_joey",
    name: "Joey",
    title: "Youngster",
    difficulty: "easy",
    team: [
      { speciesId: 19, level: 10 },   // Rattata
      { speciesId: 16, level: 12 },   // Pidgey
    ],
    rewardCurrency: 175,
    rewardXpMultiplier: 1.0,
    cooldownMinutes: 15,
    description: "My Rattata is in the top percentage of Rattata!",
  },
  {
    id: "lass_sarah",
    name: "Sarah",
    title: "Lass",
    difficulty: "easy",
    team: [
      { speciesId: 29, level: 12 },   // Nidoran F
      { speciesId: 35, level: 14 },   // Clefairy
    ],
    rewardCurrency: 200,
    rewardXpMultiplier: 1.0,
    cooldownMinutes: 15,
    description: "A cheerful trainer with cute Pokemon.",
  },

  // ── Medium Trainers ──
  {
    id: "hiker_marco",
    name: "Marco",
    title: "Hiker",
    difficulty: "medium",
    team: [
      { speciesId: 74, level: 22 },   // Geodude
      { speciesId: 95, level: 25 },   // Onix
      { speciesId: 75, level: 27 },   // Graveler
    ],
    rewardCurrency: 400,
    rewardXpMultiplier: 1.5,
    cooldownMinutes: 30,
    description: "A sturdy hiker who specializes in Rock-type Pokemon.",
  },
  {
    id: "swimmer_tina",
    name: "Tina",
    title: "Swimmer",
    difficulty: "medium",
    team: [
      { speciesId: 120, level: 25 },  // Staryu
      { speciesId: 116, level: 27 },  // Horsea
      { speciesId: 55, level: 30 },   // Golduck
    ],
    rewardCurrency: 450,
    rewardXpMultiplier: 1.5,
    cooldownMinutes: 30,
    description: "A skilled swimmer with powerful Water-type Pokemon.",
  },
  {
    id: "firebreather_kai",
    name: "Kai",
    title: "Fire Breather",
    difficulty: "medium",
    team: [
      { speciesId: 58, level: 26 },   // Growlithe
      { speciesId: 126, level: 28 },  // Magmar
      { speciesId: 78, level: 30 },   // Rapidash
    ],
    rewardCurrency: 450,
    rewardXpMultiplier: 1.5,
    cooldownMinutes: 30,
    description: "A performer who battles with intense Fire-types.",
  },
  {
    id: "psychic_elena",
    name: "Elena",
    title: "Psychic",
    difficulty: "medium",
    team: [
      { speciesId: 63, level: 28 },   // Abra
      { speciesId: 97, level: 30 },   // Hypno
      { speciesId: 122, level: 32 },  // Mr. Mime
    ],
    rewardCurrency: 500,
    rewardXpMultiplier: 1.5,
    cooldownMinutes: 30,
    description: "A mysterious psychic with mind-bending Pokemon.",
  },

  // ── Hard Trainers ──
  {
    id: "acetrainer_rex",
    name: "Rex",
    title: "Ace Trainer",
    difficulty: "hard",
    team: [
      { speciesId: 59, level: 45 },   // Arcanine
      { speciesId: 76, level: 45 },   // Golem
      { speciesId: 130, level: 48 },  // Gyarados
      { speciesId: 65, level: 48 },   // Alakazam
    ],
    rewardCurrency: 800,
    rewardXpMultiplier: 2.0,
    cooldownMinutes: 60,
    description: "A veteran trainer with a diverse, powerful team.",
  },
  {
    id: "acetrainer_luna",
    name: "Luna",
    title: "Ace Trainer",
    difficulty: "hard",
    team: [
      { speciesId: 94, level: 46 },   // Gengar
      { speciesId: 134, level: 46 },  // Vaporeon
      { speciesId: 68, level: 48 },   // Machamp
      { speciesId: 103, level: 50 },  // Exeggutor
    ],
    rewardCurrency: 850,
    rewardXpMultiplier: 2.0,
    cooldownMinutes: 60,
    description: "A strategic trainer who always has a counter ready.",
  },
  {
    id: "veterantrainer_drake",
    name: "Drake",
    title: "Veteran Trainer",
    difficulty: "hard",
    team: [
      { speciesId: 149, level: 55 },  // Dragonite
      { speciesId: 131, level: 53 },  // Lapras
      { speciesId: 143, level: 55 },  // Snorlax
      { speciesId: 112, level: 52 },  // Rhydon
      { speciesId: 6, level: 55 },    // Charizard
    ],
    rewardCurrency: 1000,
    rewardXpMultiplier: 2.5,
    cooldownMinutes: 60,
    description: "A legendary veteran with dragon-scale resolve.",
  },

  // ── Elite Trainers ──
  {
    id: "elite_champion_red",
    name: "Red",
    title: "Pokemon Champion",
    difficulty: "elite",
    team: [
      { speciesId: 25, level: 88 },   // Pikachu
      { speciesId: 3, level: 84 },    // Venusaur
      { speciesId: 6, level: 84 },    // Charizard
      { speciesId: 9, level: 84 },    // Blastoise
      { speciesId: 143, level: 87 },  // Snorlax
      { speciesId: 131, level: 85 },  // Lapras
    ],
    rewardCurrency: 2500,
    rewardXpMultiplier: 3.0,
    cooldownMinutes: 120,
    description: "The legendary Champion from Mt. Silver. The ultimate challenge.",
  },
  {
    id: "elite_champion_cynthia",
    name: "Cynthia",
    title: "Sinnoh Champion",
    difficulty: "elite",
    team: [
      { speciesId: 445, level: 88 },  // Garchomp
      { speciesId: 350, level: 83 },  // Milotic
      { speciesId: 407, level: 83 },  // Roserade
      { speciesId: 448, level: 85 },  // Lucario
      { speciesId: 442, level: 83 },  // Spiritomb
      { speciesId: 468, level: 85 },  // Togekiss
    ],
    rewardCurrency: 2500,
    rewardXpMultiplier: 3.0,
    cooldownMinutes: 120,
    description: "The fearsome Sinnoh Champion known for her Garchomp.",
  },
];

/**
 * Get a trainer definition by ID.
 */
export function getTrainerById(trainerId: string): NpcTrainerDef | undefined {
  return NPC_TRAINERS.find((t) => t.id === trainerId);
}

/**
 * Get all trainers of a given difficulty.
 */
export function getTrainersByDifficulty(difficulty: NpcDifficulty): NpcTrainerDef[] {
  return NPC_TRAINERS.filter((t) => t.difficulty === difficulty);
}

/**
 * Get the NPC user ID for a trainer.
 */
export function getNpcUserId(trainerId: string): string {
  return `${NPC_USER_ID_PREFIX}${trainerId}`;
}

/**
 * Check if a userId is an NPC.
 */
export function isNpcUser(userId: string): boolean {
  return userId.startsWith(NPC_USER_ID_PREFIX);
}

// ─── Team Generation ─────────────────────────────────────────────────────────

/**
 * Build a full BattlePokemon team from a trainer definition.
 * Generates stats from random IVs and auto-assigns moves.
 */
export async function buildNpcTeam(trainer: NpcTrainerDef): Promise<BattlePokemon[]> {
  const team: BattlePokemon[] = [];

  for (const member of trainer.team) {
    const pokemon = await buildNpcPokemon(member.speciesId, member.level);
    if (pokemon) team.push(pokemon);
  }

  return team;
}

/**
 * Build a single NPC BattlePokemon from species + level.
 * Similar to generateWildPokemon but for fixed species/level.
 */
async function buildNpcPokemon(speciesId: number, level: number): Promise<BattlePokemon | null> {
  try {
    const apiPokemon = await findMonsterByID(speciesId);
    if (!apiPokemon) {
      logger.warn(`NPC Pokemon species ${speciesId} not found`);
      return null;
    }

    // NPC Pokemon get decent IVs (20-31 range for hard/elite, standard for others)
    const ivStats = generatePokemonIVs(false);
    const nature = getRandomNature();

    const mockMonster = {
      monster_id: speciesId,
      level,
      nature,
      ...ivStats,
    } as any;

    const stats = calculateAllStats(apiPokemon.stats, mockMonster);
    const images = getPokemonImages(apiPokemon, false);

    const types = apiPokemon.types
      .sort((a: any, b: any) => a.slot - b.slot)
      .map((t: any) => t.type.name);

    const displayName = capitalizeFirstLetter(apiPokemon.name);

    // Generate moves (same as wild Pokemon -- no DB storage)
    const moves = await generateNpcMoves(speciesId, level);

    return {
      dbId: 0,
      speciesId,
      name: displayName,
      level,
      types,
      maxHp: stats.hp,
      currentHp: stats.hp,
      stats: {
        attack: stats.attack,
        defense: stats.defense,
        sp_attack: stats.sp_attack,
        sp_defense: stats.sp_defense,
        speed: stats.speed,
      },
      moves,
      spriteUrl: images.normal || "",
      isShiny: false,
      statStages: defaultStatStages(),
    };
  } catch (error) {
    logger.error(`Error building NPC pokemon species ${speciesId}:`, error);
    return null;
  }
}

/**
 * Generate moves for an NPC Pokemon (same approach as wild).
 */
async function generateNpcMoves(speciesId: number, level: number): Promise<BattleMove[]> {
  // Reuse the wild move generation logic
  const { generateWildPokemon } = await import("./battle-wild");

  // We can't directly call generateWildMoves since it's not exported,
  // so we use the same approach inline
  const { getPokemonMove } = await import("../monsters");
  const { MOVE_CACHE } = await import("../../cache");

  try {
    const pokemon = await findMonsterByID(speciesId);
    if (!pokemon || !pokemon.moves) {
      return [makeStruggle()];
    }

    const learnableMoves: Array<{ moveName: string; moveUrl: string; level: number }> = [];

    for (const moveEntry of pokemon.moves) {
      for (const vd of moveEntry.version_group_details) {
        if (vd.move_learn_method.name === "level-up" && vd.level_learned_at <= level && vd.level_learned_at > 0) {
          learnableMoves.push({
            moveName: moveEntry.move.name,
            moveUrl: moveEntry.move.url,
            level: vd.level_learned_at,
          });
          break;
        }
      }
    }

    learnableMoves.sort((a, b) => b.level - a.level);

    const battleMoves: BattleMove[] = [];

    // First pass: damaging moves
    for (const learnable of learnableMoves) {
      if (battleMoves.length >= 4) break;

      const moveId = extractMoveId(learnable.moveUrl);
      if (!moveId) continue;

      const cacheKey = `move_${moveId}`;
      let moveData = MOVE_CACHE.get(cacheKey);
      if (!moveData) {
        moveData = await getPokemonMove(moveId);
        if (moveData) MOVE_CACHE.set(cacheKey, moveData);
      }
      if (!moveData) continue;

      if (moveData.power && moveData.power > 0) {
        battleMoves.push(apiMoveToBattleMove(moveData));
      }
    }

    // Second pass: fill with status moves
    if (battleMoves.length < 4) {
      for (const learnable of learnableMoves) {
        if (battleMoves.length >= 4) break;

        const moveId = extractMoveId(learnable.moveUrl);
        if (!moveId) continue;
        if (battleMoves.some((m) => m.moveId === moveId)) continue;

        const cacheKey = `move_${moveId}`;
        let moveData = MOVE_CACHE.get(cacheKey);
        if (!moveData) {
          moveData = await getPokemonMove(moveId);
          if (moveData) MOVE_CACHE.set(cacheKey, moveData);
        }
        if (!moveData) continue;

        battleMoves.push(apiMoveToBattleMove(moveData));
      }
    }

    return battleMoves.length > 0 ? battleMoves : [makeStruggle()];
  } catch (error) {
    logger.error(`Error generating NPC moves for species ${speciesId}:`, error);
    return [makeStruggle()];
  }
}

function extractMoveId(url: string): number | null {
  try {
    const parts = url.split("/").filter(Boolean);
    const id = parseInt(parts[parts.length - 1]);
    return isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

function apiMoveToBattleMove(apiMove: any): BattleMove {
  const category = apiMove.damage_class?.name || "physical";
  const statChanges: Array<{ stat: string; change: number }> = [];

  if (apiMove.stat_changes && Array.isArray(apiMove.stat_changes)) {
    for (const sc of apiMove.stat_changes) {
      statChanges.push({ stat: sc.stat?.name || "attack", change: sc.change || 0 });
    }
  }

  const name = (apiMove.name as string)
    .split("-")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    moveId: apiMove.id,
    name,
    type: apiMove.type?.name || "normal",
    power: apiMove.power ?? null,
    accuracy: apiMove.accuracy ?? 100,
    pp: apiMove.pp ?? 10,
    ppMax: apiMove.pp ?? 10,
    category: category as "physical" | "special" | "status",
    priority: apiMove.priority ?? 0,
    effectChance: apiMove.effect_chance ?? null,
    statChanges,
  };
}

function makeStruggle(): BattleMove {
  return {
    moveId: 0, name: "Struggle", type: "normal", power: 50, accuracy: 100,
    pp: 999, ppMax: 999, category: "physical", priority: 0, effectChance: null, statChanges: [],
  };
}

// ─── Progress Tracking ───────────────────────────────────────────────────────

/**
 * Get a user's progress for a specific trainer.
 */
export async function getTrainerProgress(
  userId: string,
  trainerId: string,
): Promise<INpcTrainerProgressModel | null> {
  try {
    return await databaseClient<INpcTrainerProgressModel>(NpcTrainerProgressTable)
      .select()
      .where({ uid: userId, trainer_id: trainerId })
      .first() || null;
  } catch (error) {
    logger.error(`Error fetching trainer progress for ${userId}/${trainerId}:`, error);
    return null;
  }
}

/**
 * Get all progress for a user.
 */
export async function getAllTrainerProgress(
  userId: string,
): Promise<INpcTrainerProgressModel[]> {
  try {
    return await databaseClient<INpcTrainerProgressModel>(NpcTrainerProgressTable)
      .select()
      .where("uid", userId);
  } catch (error) {
    logger.error(`Error fetching all trainer progress for ${userId}:`, error);
    return [];
  }
}

/**
 * Record a battle attempt (win or loss).
 */
export async function recordTrainerAttempt(
  userId: string,
  trainerId: string,
  won: boolean,
): Promise<void> {
  try {
    const existing = await getTrainerProgress(userId, trainerId);

    if (existing) {
      const update: Partial<INpcTrainerProgressModel> = {
        attempts: existing.attempts + 1,
        last_attempt_at: new Date().toISOString(),
      };
      if (won) {
        update.wins = existing.wins + 1;
        if (!existing.first_win_at) {
          update.first_win_at = new Date().toISOString();
        }
      }
      await databaseClient<INpcTrainerProgressModel>(NpcTrainerProgressTable)
        .where({ uid: userId, trainer_id: trainerId })
        .update(update);
    } else {
      await databaseClient<INpcTrainerProgressModel>(NpcTrainerProgressTable).insert({
        uid: userId,
        trainer_id: trainerId,
        wins: won ? 1 : 0,
        attempts: 1,
        last_attempt_at: new Date().toISOString(),
        first_win_at: won ? new Date().toISOString() : undefined,
      });
    }
  } catch (error) {
    logger.error(`Error recording trainer attempt for ${userId}/${trainerId}:`, error);
  }
}

/**
 * Check if a trainer is on cooldown for a user.
 * Returns minutes remaining, or 0 if ready.
 */
export async function getTrainerCooldown(
  userId: string,
  trainerId: string,
  cooldownMinutes: number,
): Promise<number> {
  try {
    const progress = await getTrainerProgress(userId, trainerId);
    if (!progress?.last_attempt_at) return 0;

    const lastAttempt = new Date(progress.last_attempt_at).getTime();
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const remaining = (lastAttempt + cooldownMs) - Date.now();

    return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
  } catch (error) {
    logger.error(`Error checking trainer cooldown for ${userId}/${trainerId}:`, error);
    return 0;
  }
}

// ─── Reward Calculation ──────────────────────────────────────────────────────

/**
 * Calculate NPC battle rewards.
 */
export function calculateNpcRewards(
  trainer: NpcTrainerDef,
  playerLevel: number,
  halved: boolean,
): { xp: number; currency: number } {
  const avgTrainerLevel = trainer.team.reduce((sum, m) => sum + m.level, 0) / trainer.team.length;
  let xp = Math.floor(avgTrainerLevel * 100 * trainer.rewardXpMultiplier);
  let currency = trainer.rewardCurrency;

  if (halved) {
    xp = Math.floor(xp / 2);
    currency = Math.floor(currency / 2);
  }

  return { xp, currency };
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<NpcDifficulty, number> = {
  easy: 0x4caf50,
  medium: 0xff9800,
  hard: 0xf44336,
  elite: 0x9c27b0,
};

const DIFFICULTY_LABELS: Record<NpcDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  elite: "Elite",
};

/**
 * Build the trainer list embed for a difficulty tier.
 */
export function buildTrainerListEmbed(
  difficulty: NpcDifficulty,
  trainers: NpcTrainerDef[],
  userProgress: INpcTrainerProgressModel[],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${DIFFICULTY_LABELS[difficulty]} Trainers`)
    .setColor(DIFFICULTY_COLORS[difficulty])
    .setTimestamp();

  for (const trainer of trainers) {
    const progress = userProgress.find((p) => p.trainer_id === trainer.id);
    const wins = progress?.wins || 0;
    const attempts = progress?.attempts || 0;
    const beaten = wins > 0 ? " \\u2705" : "";
    const teamPreview = trainer.team.map((m) => `Lv.${m.level}`).join(", ");

    embed.addFields({
      name: `${trainer.title} ${trainer.name}${beaten}`,
      value: `*${trainer.description}*\nTeam: ${trainer.team.length} Pokemon (${teamPreview})\nReward: ${trainer.rewardCurrency} currency | CD: ${trainer.cooldownMinutes}min\nRecord: ${wins}W / ${attempts} attempts`,
      inline: false,
    });
  }

  if (trainers.length === 0) {
    embed.setDescription("No trainers available in this tier.");
  }

  return embed;
}
