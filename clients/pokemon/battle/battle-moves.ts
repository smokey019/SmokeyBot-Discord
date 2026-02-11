/**
 * Move assignment and loading for the battle system.
 * Handles assigning moves to Pokemon that don't have them yet,
 * and loading move data from the database + PokeAPI for battle use.
 */

import { databaseClient } from "../../database";
import { getLogger } from "../../logger";
import { MOVE_CACHE } from "../../cache";
import { MonsterMovesTable, type IMonsterMovesModel } from "../../../models/MonsterMoves";
import { findMonsterByID, getPokemonMove } from "../monsters";
import type { BattleMove } from "./battle-state";

const logger = getLogger("BattleMoves");

/** Struggle -- the universal fallback move when a Pokemon has no moves or all PP is spent */
const STRUGGLE_MOVE: BattleMove = {
  moveId: 0,
  name: "Struggle",
  type: "normal",
  power: 50,
  accuracy: 100,
  pp: 999,
  ppMax: 999,
  category: "physical",
  priority: 0,
  effectChance: null,
  statChanges: [],
};

/**
 * Get the moves for a Pokemon from the database.
 * Returns empty array if the Pokemon has no moves assigned yet.
 */
export async function getMonsterMoves(monsterDbId: number): Promise<IMonsterMovesModel[]> {
  try {
    const moves = await databaseClient<IMonsterMovesModel>(MonsterMovesTable)
      .select()
      .where("monster_db_id", monsterDbId)
      .orderBy("slot", "asc");
    return moves;
  } catch (error) {
    logger.error(`Error fetching moves for monster ${monsterDbId}:`, error);
    return [];
  }
}

/**
 * Fetch full move data from PokeAPI, with caching.
 */
async function fetchMoveData(moveId: number): Promise<any | null> {
  const cacheKey = `move_${moveId}`;
  const cached = MOVE_CACHE.get(cacheKey);
  if (cached) return cached;

  const moveData = await getPokemonMove(moveId);
  if (moveData) {
    MOVE_CACHE.set(cacheKey, moveData);
  }
  return moveData;
}

/**
 * Convert raw PokeAPI move data into our BattleMove format.
 */
function toBattleMove(apiMove: any, ppRemaining?: number): BattleMove {
  const category = apiMove.damage_class?.name || "physical";
  const statChanges: BattleMove["statChanges"] = [];

  if (apiMove.stat_changes && Array.isArray(apiMove.stat_changes)) {
    for (const sc of apiMove.stat_changes) {
      statChanges.push({
        stat: sc.stat?.name || "attack",
        change: sc.change || 0,
      });
    }
  }

  return {
    moveId: apiMove.id,
    name: formatMoveName(apiMove.name),
    type: apiMove.type?.name || "normal",
    power: apiMove.power ?? null,
    accuracy: apiMove.accuracy ?? 100,
    pp: ppRemaining ?? apiMove.pp ?? 10,
    ppMax: apiMove.pp ?? 10,
    category: category as BattleMove["category"],
    priority: apiMove.priority ?? 0,
    effectChance: apiMove.effect_chance ?? null,
    statChanges,
  };
}

/**
 * Format move name from API format (e.g., "thunder-punch" -> "Thunder Punch").
 */
function formatMoveName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Assign moves to a Pokemon that doesn't have any yet.
 * Picks the 4 highest-level moves the Pokemon would know at its current level.
 * Only assigns damaging moves for Phase 1 (status moves deferred to Phase 2).
 */
export async function assignMovesToMonster(
  monsterDbId: number,
  speciesId: number,
  level: number,
): Promise<IMonsterMovesModel[]> {
  try {
    // Check if moves already exist
    const existing = await getMonsterMoves(monsterDbId);
    if (existing.length > 0) return existing;

    // Fetch species data from PokeAPI to get learnable moves
    const pokemon = await findMonsterByID(speciesId);
    if (!pokemon || !pokemon.moves) {
      logger.warn(`No Pokemon data found for species ${speciesId}, assigning Struggle`);
      return await assignStruggle(monsterDbId);
    }

    // Filter to level-up moves the Pokemon could know at its current level
    const learnableMoves: Array<{ moveUrl: string; moveName: string; level: number }> = [];

    for (const moveEntry of pokemon.moves) {
      for (const versionDetail of moveEntry.version_group_details) {
        if (
          versionDetail.move_learn_method.name === "level-up" &&
          versionDetail.level_learned_at <= level &&
          versionDetail.level_learned_at > 0
        ) {
          learnableMoves.push({
            moveUrl: moveEntry.move.url,
            moveName: moveEntry.move.name,
            level: versionDetail.level_learned_at,
          });
          break; // Only take one version group entry per move
        }
      }
    }

    // Sort by level descending (highest level moves first = most recently learned)
    learnableMoves.sort((a, b) => b.level - a.level);

    // Fetch full move data and filter to damaging moves (power > 0)
    const selectedMoves: Array<{ moveId: number; pp: number }> = [];

    for (const learnable of learnableMoves) {
      if (selectedMoves.length >= 4) break;

      // Extract move ID from URL
      const moveId = extractMoveId(learnable.moveUrl, learnable.moveName);
      if (!moveId) continue;

      const moveData = await fetchMoveData(moveId);
      if (!moveData) continue;

      // For Phase 1, prefer damaging moves but accept status moves if needed
      if (moveData.power && moveData.power > 0) {
        selectedMoves.push({ moveId: moveData.id, pp: moveData.pp || 10 });
      }
    }

    // If we found fewer than 4 damaging moves, also include status moves
    if (selectedMoves.length < 4) {
      for (const learnable of learnableMoves) {
        if (selectedMoves.length >= 4) break;

        const moveId = extractMoveId(learnable.moveUrl, learnable.moveName);
        if (!moveId) continue;
        if (selectedMoves.some((m) => m.moveId === moveId)) continue; // Skip duplicates

        const moveData = await fetchMoveData(moveId);
        if (!moveData) continue;

        selectedMoves.push({ moveId: moveData.id, pp: moveData.pp || 10 });
      }
    }

    // Fallback: if still no moves, assign Struggle
    if (selectedMoves.length === 0) {
      logger.warn(`No learnable moves found for species ${speciesId} at level ${level}, assigning Struggle`);
      return await assignStruggle(monsterDbId);
    }

    // Insert moves into database
    const moveRecords: IMonsterMovesModel[] = [];
    for (let i = 0; i < selectedMoves.length; i++) {
      const record: IMonsterMovesModel = {
        monster_db_id: monsterDbId,
        move_id: selectedMoves[i].moveId,
        slot: i + 1,
        pp_remaining: selectedMoves[i].pp,
        pp_max: selectedMoves[i].pp,
      };

      await databaseClient<IMonsterMovesModel>(MonsterMovesTable).insert(record);
      moveRecords.push(record);
    }

    logger.info(`Assigned ${moveRecords.length} moves to monster ${monsterDbId} (species ${speciesId}, level ${level})`);
    return moveRecords;
  } catch (error) {
    logger.error(`Error assigning moves to monster ${monsterDbId}:`, error);
    return await assignStruggle(monsterDbId);
  }
}

/**
 * Extract move ID from PokeAPI URL or fetch by name.
 */
function extractMoveId(url: string, name: string): number | null {
  try {
    // URL format: https://pokeapi.co/api/v2/move/{id}/
    const parts = url.split("/").filter(Boolean);
    const id = parseInt(parts[parts.length - 1]);
    if (!isNaN(id)) return id;
  } catch {
    // Fall through to null
  }
  return null;
}

/**
 * Assign the Struggle move as a fallback.
 */
async function assignStruggle(monsterDbId: number): Promise<IMonsterMovesModel[]> {
  // Struggle is not stored in DB -- it's synthesized at runtime
  // Return empty so loadBattleMoves falls back to STRUGGLE_MOVE
  return [];
}

/**
 * Load battle-ready moves for a Pokemon.
 * Assigns moves if none exist, then enriches DB records with PokeAPI data.
 */
export async function loadBattleMoves(
  monsterDbId: number,
  speciesId: number,
  level: number,
): Promise<BattleMove[]> {
  // Ensure moves are assigned
  let dbMoves = await getMonsterMoves(monsterDbId);
  if (dbMoves.length === 0) {
    dbMoves = await assignMovesToMonster(monsterDbId, speciesId, level);
  }

  // If still no moves (Struggle fallback), return Struggle
  if (dbMoves.length === 0) {
    return [{ ...STRUGGLE_MOVE }];
  }

  // Enrich each DB move with full PokeAPI data
  const battleMoves: BattleMove[] = [];
  for (const dbMove of dbMoves) {
    const apiMove = await fetchMoveData(dbMove.move_id);
    if (apiMove) {
      battleMoves.push(toBattleMove(apiMove, dbMove.pp_remaining));
    }
  }

  // Fallback if all API fetches failed
  if (battleMoves.length === 0) {
    return [{ ...STRUGGLE_MOVE }];
  }

  return battleMoves;
}

/**
 * Restore PP for all moves of a Pokemon in the database (after battle ends or at Pokemon Center).
 */
export async function restoreMovePP(monsterDbId: number): Promise<void> {
  try {
    const moves = await getMonsterMoves(monsterDbId);
    for (const move of moves) {
      await databaseClient<IMonsterMovesModel>(MonsterMovesTable)
        .where("id", move.id)
        .update({ pp_remaining: move.pp_max });
    }
  } catch (error) {
    logger.error(`Error restoring PP for monster ${monsterDbId}:`, error);
  }
}

/** Re-export Struggle for use by the battle engine (when all PP is 0 mid-battle) */
export { STRUGGLE_MOVE };
