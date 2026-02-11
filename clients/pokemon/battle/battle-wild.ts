/**
 * Wild Pokemon battle system.
 * Handles wild Pokemon generation, AI move selection, and catch mechanics.
 */

import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { databaseClient, getUser } from "../../database";
import { getLogger } from "../../logger";
import { getRndInteger } from "../../../utils";
import { MonsterTable, type IMonsterModel } from "../../../models/Monster";
import { MonsterUserTable, type IMonsterUserModel } from "../../../models/MonsterUser";
import {
  findMonsterByID,
  getRandomMonster,
  generatePokemonIVs,
  calculateIVPercentage,
} from "../monsters";
import { calculateAllStats, getPokemonImages } from "../info";
import { capitalizeFirstLetter, rollLevel, rollShiny, rollGender, rollPerfectIV } from "../utils";
import { getRandomNature } from "../natures";
import { queueMessage } from "../../message_queue";
import {
  type BattleState,
  type BattlePokemon,
  type BattlePlayer,
  generateBattleId,
  isUserInBattle,
  registerBattle,
  cleanupBattle,
  defaultStatStages,
  createBattlePlayer,
  activeBattles,
} from "./battle-state";
import { loadBattleMoves } from "./battle-moves";
import { buildBattleEmbed, buildMoveButtons, buildBattleOverEmbed } from "./battle-ui";
import { calculateRewards, applyRewards, logBattle, shouldHalveRewards } from "./battle-rewards";

const logger = getLogger("BattleWild");

/** Wild Pokemon user ID placeholder */
const WILD_USER_ID = "wild_pokemon";

/** Base catch rate (at full HP) */
const BASE_CATCH_RATE = 0.10;
/** Max catch rate (at 1 HP) */
const MAX_CATCH_RATE = 0.85;
/** HP threshold below which the catch button appears */
const CATCH_HP_THRESHOLD = 0.25;
/** XP multiplier for wild battles (less than PvP) */
const WILD_XP_MULTIPLIER = 0.75;

const BASE_EXPERIENCE_MULTIPLIER = 1250;

/**
 * Check if a battle is a wild battle.
 */
export function isWildBattle(battle: BattleState): boolean {
  return battle.battleType === "wild";
}

/**
 * Get the human player from a wild battle.
 */
export function getHumanPlayer(battle: BattleState): BattlePlayer {
  return battle.player1;
}

/**
 * Get the wild Pokemon player from a wild battle.
 */
export function getWildPlayer(battle: BattleState): BattlePlayer {
  return battle.player2;
}

/**
 * Select a move for the wild Pokemon AI.
 * Weighted random: higher-power moves are more likely.
 */
export function selectWildMove(wildPokemon: BattlePokemon): number {
  const moves = wildPokemon.moves;
  if (moves.length === 0) return -1; // Struggle

  // Filter to moves with PP remaining
  const availableMoves = moves
    .map((m, i) => ({ move: m, index: i }))
    .filter((m) => m.move.pp > 0);

  if (availableMoves.length === 0) return -1; // Struggle

  // Weight by power (status moves get a base weight of 30)
  const weights = availableMoves.map((m) => {
    const power = m.move.power ?? 0;
    return power > 0 ? power : 30;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (let i = 0; i < availableMoves.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return availableMoves[i].index;
  }

  return availableMoves[0].index;
}

/**
 * Calculate catch probability based on wild Pokemon's remaining HP.
 * Lower HP = higher catch chance.
 */
export function calculateCatchChance(wildPokemon: BattlePokemon): number {
  const hpRatio = wildPokemon.currentHp / wildPokemon.maxHp;
  // Linear interpolation: full HP = BASE_CATCH_RATE, 0 HP = MAX_CATCH_RATE
  const chance = BASE_CATCH_RATE + (1 - hpRatio) * (MAX_CATCH_RATE - BASE_CATCH_RATE);
  return Math.min(MAX_CATCH_RATE, Math.max(BASE_CATCH_RATE, chance));
}

/**
 * Check if the catch button should be shown.
 */
export function shouldShowCatchButton(wildPokemon: BattlePokemon): boolean {
  const hpRatio = wildPokemon.currentHp / wildPokemon.maxHp;
  return hpRatio <= CATCH_HP_THRESHOLD && wildPokemon.currentHp > 0;
}

/**
 * Attempt to catch a wild Pokemon.
 * Returns true if caught, false if it escaped.
 */
export function attemptCatch(wildPokemon: BattlePokemon): boolean {
  const chance = calculateCatchChance(wildPokemon);
  return Math.random() < chance;
}

/**
 * Insert a caught wild Pokemon into the database.
 */
export async function insertCaughtPokemon(
  userId: string,
  wildPokemon: BattlePokemon,
): Promise<{ dbId: number; isShiny: boolean; avgIv: number } | null> {
  try {
    const shiny = rollShiny();
    const gender = rollGender();
    const isPerfect = rollPerfectIV();
    const ivStats = generatePokemonIVs(isPerfect);
    const avgIv = calculateIVPercentage(ivStats);

    const monster: IMonsterModel = {
      monster_id: wildPokemon.speciesId,
      ...ivStats,
      nature: getRandomNature(),
      experience: wildPokemon.level * BASE_EXPERIENCE_MULTIPLIER,
      level: wildPokemon.level,
      uid: userId,
      original_uid: userId,
      shiny: shiny,
      captured_at: Date.now(),
      gender: gender,
      egg: 0,
      avg_iv: avgIv,
    };

    const insertResult = await databaseClient<IMonsterModel>(MonsterTable).insert(monster);
    const insertedId = insertResult[0];

    // Update user's latest_monster and give currency
    await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: userId })
      .update({ latest_monster: insertedId })
      .increment("currency", 10);

    logger.info(`User ${userId} caught wild ${wildPokemon.name} (DB ID: ${insertedId})`);

    return { dbId: insertedId, isShiny: shiny === 1, avgIv };
  } catch (error) {
    logger.error(`Error inserting caught pokemon for ${userId}:`, error);
    return null;
  }
}

/**
 * Generate a wild BattlePokemon with random species and level near the player's.
 */
export async function generateWildPokemon(playerLevel: number): Promise<BattlePokemon | null> {
  // Try up to 5 times to find a valid Pokemon with sprites
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const speciesId = getRandomMonster();
      const apiPokemon = await findMonsterByID(speciesId);
      if (!apiPokemon) continue;

      // Wild level: player level ±5, clamped 1-100
      const minLevel = Math.max(1, playerLevel - 5);
      const maxLevel = Math.min(100, playerLevel + 5);
      const wildLevel = getRndInteger(minLevel, maxLevel);

      // Generate random IVs for stat calculation
      const ivStats = generatePokemonIVs(false);
      const nature = getRandomNature();

      // Build a mock DB monster for stat calculation
      const mockMonster = {
        monster_id: speciesId,
        level: wildLevel,
        nature,
        ...ivStats,
      } as IMonsterModel;

      const stats = calculateAllStats(apiPokemon.stats, mockMonster);
      const images = getPokemonImages(apiPokemon, false);

      const types = apiPokemon.types
        .sort((a: any, b: any) => a.slot - b.slot)
        .map((t: any) => t.type.name);

      const displayName = capitalizeFirstLetter(apiPokemon.name);

      // Generate moves for the wild Pokemon (without DB storage)
      const moves = await generateWildMoves(speciesId, wildLevel);

      return {
        dbId: 0, // Wild Pokemon has no DB entry yet
        speciesId,
        name: displayName,
        level: wildLevel,
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
      logger.warn(`Error generating wild pokemon (attempt ${attempt + 1}):`, error);
    }
  }

  return null;
}

/**
 * Generate moves for a wild Pokemon without storing to DB.
 * Uses the same logic as assignMovesToMonster but doesn't persist.
 */
async function generateWildMoves(speciesId: number, level: number): Promise<import("./battle-state").BattleMove[]> {
  const { getPokemonMove } = await import("../monsters");
  const { MOVE_CACHE } = await import("../../cache");

  try {
    const pokemon = await findMonsterByID(speciesId);
    if (!pokemon || !pokemon.moves) {
      return [{ moveId: 0, name: "Struggle", type: "normal", power: 50, accuracy: 100, pp: 999, ppMax: 999, category: "physical", priority: 0, effectChance: null, statChanges: [] }];
    }

    // Filter level-up moves
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

    const battleMoves: import("./battle-state").BattleMove[] = [];

    for (const learnable of learnableMoves) {
      if (battleMoves.length >= 4) break;

      const moveId = extractMoveIdFromUrl(learnable.moveUrl);
      if (!moveId) continue;

      const cacheKey = `move_${moveId}`;
      let moveData = MOVE_CACHE.get(cacheKey);
      if (!moveData) {
        moveData = await getPokemonMove(moveId);
        if (moveData) MOVE_CACHE.set(cacheKey, moveData);
      }
      if (!moveData) continue;

      // Prefer damaging moves
      if (moveData.power && moveData.power > 0) {
        battleMoves.push(toBattleMove(moveData));
      }
    }

    // Fill with status moves if needed
    if (battleMoves.length < 4) {
      for (const learnable of learnableMoves) {
        if (battleMoves.length >= 4) break;

        const moveId = extractMoveIdFromUrl(learnable.moveUrl);
        if (!moveId) continue;
        if (battleMoves.some(m => m.moveId === moveId)) continue;

        const cacheKey = `move_${moveId}`;
        let moveData = MOVE_CACHE.get(cacheKey);
        if (!moveData) {
          moveData = await getPokemonMove(moveId);
          if (moveData) MOVE_CACHE.set(cacheKey, moveData);
        }
        if (!moveData) continue;

        battleMoves.push(toBattleMove(moveData));
      }
    }

    if (battleMoves.length === 0) {
      return [{ moveId: 0, name: "Struggle", type: "normal", power: 50, accuracy: 100, pp: 999, ppMax: 999, category: "physical", priority: 0, effectChance: null, statChanges: [] }];
    }

    return battleMoves;
  } catch (error) {
    logger.error(`Error generating wild moves for species ${speciesId}:`, error);
    return [{ moveId: 0, name: "Struggle", type: "normal", power: 50, accuracy: 100, pp: 999, ppMax: 999, category: "physical", priority: 0, effectChance: null, statChanges: [] }];
  }
}

function extractMoveIdFromUrl(url: string): number | null {
  try {
    const parts = url.split("/").filter(Boolean);
    const id = parseInt(parts[parts.length - 1]);
    return isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

function toBattleMove(apiMove: any): import("./battle-state").BattleMove {
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

/**
 * Calculate wild battle rewards (reduced compared to PvP).
 */
export function calculateWildRewards(
  playerLevel: number,
  wildLevel: number,
  halved: boolean,
): { xp: number; currency: number } {
  let xp = Math.floor(wildLevel * 75 * WILD_XP_MULTIPLIER);
  let currency = wildLevel * 2;

  if (halved) {
    xp = Math.floor(xp / 2);
    currency = Math.floor(currency / 2);
  }

  return { xp, currency };
}

export { WILD_USER_ID };
