/**
 * Core battle engine: damage calculation, turn resolution, and move execution.
 * Supports both 1v1 and team (6v6) battles with switching.
 */

import { getLogger } from "../../logger";
import { getRndInteger } from "../../../utils";
import { getTypeMultiplier, getEffectivenessText, getStabMultiplier } from "./type-chart";
import { STRUGGLE_MOVE } from "./battle-moves";
import {
  switchActivePokemon,
  getAliveCount,
  hasAliveSwitch,
  syncPlayerAction,
} from "./battle-state";
import type {
  BattleState,
  BattlePlayer,
  BattlePokemon,
  BattleMove,
  StatStages,
  PlayerAction,
} from "./battle-state";

const logger = getLogger("BattleEngine");

/** Stat stage multiplier table: stage -6 to +6 */
const STAT_STAGE_MULTIPLIERS: Record<number, number> = {
  [-6]: 2 / 8, [-5]: 2 / 7, [-4]: 2 / 6, [-3]: 2 / 5, [-2]: 2 / 4, [-1]: 2 / 3,
  0: 1,
  1: 3 / 2, 2: 4 / 2, 3: 5 / 2, 4: 6 / 2, 5: 7 / 2, 6: 8 / 2,
};

const ACCURACY_STAGE_MULTIPLIERS: Record<number, number> = {
  [-6]: 3 / 9, [-5]: 3 / 8, [-4]: 3 / 7, [-3]: 3 / 6, [-2]: 3 / 5, [-1]: 3 / 4,
  0: 1,
  1: 4 / 3, 2: 5 / 3, 3: 6 / 3, 4: 7 / 3, 5: 8 / 3, 6: 9 / 3,
};

const CRITICAL_HIT_CHANCE = 1 / 16;
const CRITICAL_HIT_MULTIPLIER = 1.5;
const RANDOM_DAMAGE_MIN = 0.85;
const RANDOM_DAMAGE_MAX = 1.0;
const STRUGGLE_RECOIL_FRACTION = 0.25;

function getEffectiveStat(baseStat: number, stage: number): number {
  const clampedStage = Math.max(-6, Math.min(6, stage));
  return Math.floor(baseStat * (STAT_STAGE_MULTIPLIERS[clampedStage] || 1));
}

function getAccuracyMultiplier(stage: number): number {
  const clampedStage = Math.max(-6, Math.min(6, stage));
  return ACCURACY_STAGE_MULTIPLIERS[clampedStage] || 1;
}

function doesMoveHit(move: BattleMove, attacker: BattlePokemon, defender: BattlePokemon): boolean {
  if (move.accuracy === null || move.accuracy === 0) return true;
  const accuracyStage = attacker.statStages.accuracy - defender.statStages.evasion;
  const accuracyMult = getAccuracyMultiplier(accuracyStage);
  const finalAccuracy = Math.floor(move.accuracy * accuracyMult);
  return getRndInteger(1, 100) <= finalAccuracy;
}

function isCriticalHit(): boolean {
  return Math.random() < CRITICAL_HIT_CHANCE;
}

export interface DamageResult {
  damage: number;
  isCritical: boolean;
  effectiveness: number;
  effectivenessText: string | null;
  isStab: boolean;
}

/**
 * Calculate damage for a move.
 */
export function calculateDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
): DamageResult {
  if (move.category === "status" || move.power === null || move.power === 0) {
    return { damage: 0, isCritical: false, effectiveness: 1, effectivenessText: null, isStab: false };
  }

  const level = attacker.level;
  const power = move.power;

  let attackStat: number;
  let defenseStat: number;

  if (move.category === "physical") {
    attackStat = getEffectiveStat(attacker.stats.attack, attacker.statStages.attack);
    defenseStat = getEffectiveStat(defender.stats.defense, defender.statStages.defense);
  } else {
    attackStat = getEffectiveStat(attacker.stats.sp_attack, attacker.statStages.sp_attack);
    defenseStat = getEffectiveStat(defender.stats.sp_defense, defender.statStages.sp_defense);
  }

  defenseStat = Math.max(1, defenseStat);

  const baseDamage = Math.floor(((2 * level / 5 + 2) * power * attackStat / defenseStat) / 50) + 2;

  const stab = getStabMultiplier(move.type, attacker.types);
  const effectiveness = getTypeMultiplier(move.type, defender.types);
  const critical = isCriticalHit();
  const criticalMult = critical ? CRITICAL_HIT_MULTIPLIER : 1.0;
  const randomFactor = RANDOM_DAMAGE_MIN + Math.random() * (RANDOM_DAMAGE_MAX - RANDOM_DAMAGE_MIN);

  const totalModifier = stab * effectiveness * criticalMult * randomFactor;
  const finalDamage = Math.max(1, Math.floor(baseDamage * totalModifier));

  return {
    damage: effectiveness === 0 ? 0 : finalDamage,
    isCritical: critical,
    effectiveness,
    effectivenessText: getEffectivenessText(effectiveness),
    isStab: stab > 1,
  };
}

export interface MoveResult {
  attacker: string;
  move: BattleMove;
  hit: boolean;
  damageResult: DamageResult | null;
  statChangesApplied: string[];
  recoilDamage: number;
  defenderFainted: boolean;
  attackerFainted: boolean;
  messages: string[];
}

/**
 * Execute a single move from attacker against defender.
 * Mutates the BattlePokemon states (HP, PP, stat stages).
 */
export function executeMove(
  attackerPlayer: BattlePlayer,
  defenderPlayer: BattlePlayer,
  moveIndex: number,
): MoveResult {
  const attacker = attackerPlayer.pokemon;
  const defender = defenderPlayer.pokemon;

  let move: BattleMove;
  const isStruggle = moveIndex < 0 || moveIndex >= attacker.moves.length || attacker.moves[moveIndex].pp <= 0;

  if (isStruggle) {
    move = { ...STRUGGLE_MOVE };
  } else {
    move = attacker.moves[moveIndex];
    move.pp = Math.max(0, move.pp - 1);
  }

  const messages: string[] = [];
  messages.push(`**${attacker.name}** used **${move.name}**!`);

  const result: MoveResult = {
    attacker: attackerPlayer.userId,
    move,
    hit: false,
    damageResult: null,
    statChangesApplied: [],
    recoilDamage: 0,
    defenderFainted: false,
    attackerFainted: false,
    messages,
  };

  if (!doesMoveHit(move, attacker, defender)) {
    result.hit = false;
    messages.push(`${attacker.name}'s attack missed!`);
    return result;
  }

  result.hit = true;

  if (move.power !== null && move.power > 0) {
    const damageResult = calculateDamage(attacker, defender, move);
    result.damageResult = damageResult;

    if (damageResult.effectiveness === 0) {
      messages.push(damageResult.effectivenessText!);
    } else {
      defender.currentHp = Math.max(0, defender.currentHp - damageResult.damage);
      if (damageResult.effectivenessText) messages.push(damageResult.effectivenessText);
      if (damageResult.isCritical) messages.push("A critical hit!");
      messages.push(`${defender.name} took **${damageResult.damage}** damage! (${defender.currentHp}/${defender.maxHp} HP)`);

      if (isStruggle) {
        const recoil = Math.max(1, Math.floor(damageResult.damage * STRUGGLE_RECOIL_FRACTION));
        attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
        result.recoilDamage = recoil;
        messages.push(`${attacker.name} was hurt by recoil! (-${recoil} HP)`);
      }
    }
  }

  if (move.statChanges.length > 0) {
    for (const sc of move.statChanges) {
      const applied = applyStatChange(attacker, defender, sc);
      if (applied) {
        result.statChangesApplied.push(applied);
        messages.push(applied);
      }
    }
  }

  result.defenderFainted = defender.currentHp <= 0;
  result.attackerFainted = attacker.currentHp <= 0;

  if (result.defenderFainted) messages.push(`**${defender.name}** fainted!`);
  if (result.attackerFainted) messages.push(`**${attacker.name}** fainted!`);

  return result;
}

function applyStatChange(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  statChange: { stat: string; change: number },
): string | null {
  const statMap: Record<string, keyof StatStages> = {
    attack: "attack", defense: "defense",
    "special-attack": "sp_attack", "special-defense": "sp_defense",
    speed: "speed", accuracy: "accuracy", evasion: "evasion",
  };

  const statKey = statMap[statChange.stat];
  if (!statKey) return null;

  const target = statChange.change > 0 ? attacker : defender;
  const targetName = statChange.change > 0 ? attacker.name : defender.name;

  const oldStage = target.statStages[statKey];
  const newStage = Math.max(-6, Math.min(6, oldStage + statChange.change));

  if (newStage === oldStage) {
    const limitText = statChange.change > 0 ? "can't go any higher" : "can't go any lower";
    return `${targetName}'s ${formatStatName(statKey)} ${limitText}!`;
  }

  target.statStages[statKey] = newStage;
  const changeText = Math.abs(statChange.change) >= 2 ? "sharply " : "";
  const directionText = statChange.change > 0 ? "rose" : "fell";
  return `${targetName}'s ${formatStatName(statKey)} ${changeText}${directionText}!`;
}

function formatStatName(stat: string): string {
  const names: Record<string, string> = {
    attack: "Attack", defense: "Defense", sp_attack: "Sp. Atk",
    sp_defense: "Sp. Def", speed: "Speed", accuracy: "Accuracy", evasion: "Evasion",
  };
  return names[stat] || stat;
}

/**
 * Determine turn order. Switches always go before moves (priority +7 equivalent).
 */
export function determineTurnOrder(
  player1: BattlePlayer,
  player2: BattlePlayer,
): [BattlePlayer, BattlePlayer] {
  const p1Switch = player1.selectedAction?.type === "switch";
  const p2Switch = player2.selectedAction?.type === "switch";

  // Switches go first
  if (p1Switch && !p2Switch) return [player1, player2];
  if (p2Switch && !p1Switch) return [player2, player1];

  // Both switching or both attacking: compare speed
  const move1 = getSelectedMove(player1);
  const move2 = getSelectedMove(player2);

  if (!p1Switch && !p2Switch) {
    // Both attacking: check move priority
    if (move1.priority !== move2.priority) {
      return move1.priority > move2.priority ? [player1, player2] : [player2, player1];
    }
  }

  // Compare speed
  const speed1 = getEffectiveStat(player1.pokemon.stats.speed, player1.pokemon.statStages.speed);
  const speed2 = getEffectiveStat(player2.pokemon.stats.speed, player2.pokemon.statStages.speed);

  if (speed1 !== speed2) {
    return speed1 > speed2 ? [player1, player2] : [player2, player1];
  }

  return Math.random() < 0.5 ? [player1, player2] : [player2, player1];
}

function getSelectedMove(player: BattlePlayer): BattleMove {
  if (player.selectedMove === null || player.selectedMove < 0 || player.selectedMove >= player.pokemon.moves.length) {
    return STRUGGLE_MOVE;
  }
  return player.pokemon.moves[player.selectedMove];
}

export interface TurnResult {
  firstResult: MoveResult | null;
  secondResult: MoveResult | null;
  battleOver: boolean;
  winnerId: string | null;
  /** Players whose active Pokemon fainted and need to switch (team battles) */
  needsSwitch: string[];
  messages: string[];
}

/**
 * Execute a player's action (move or switch) for their half of the turn.
 */
function executeAction(
  actor: BattlePlayer,
  opponent: BattlePlayer,
  messages: string[],
): MoveResult | null {
  const action = actor.selectedAction;

  if (action?.type === "switch") {
    const oldName = actor.pokemon.name;
    switchActivePokemon(actor, action.targetIndex);
    messages.push(`<@${actor.userId}> withdrew **${oldName}** and sent out **${actor.pokemon.name}**!`);
    return null; // Switch doesn't produce a MoveResult
  }

  // Move action (or default if no action selected)
  syncPlayerAction(actor);
  return executeMove(actor, opponent, actor.selectedMove ?? -1);
}

/**
 * Resolve a full battle turn. Handles both moves and switches.
 * In team battles, a faint doesn't end the battle if the player has reserves.
 */
export function resolveTurn(battle: BattleState): TurnResult {
  const [first, second] = determineTurnOrder(battle.player1, battle.player2);

  const messages: string[] = [];
  messages.push(`--- **Turn ${battle.turn}** ---`);

  const needsSwitch: string[] = [];
  let battleOver = false;
  let winnerId: string | null = null;

  // --- First player acts ---
  const firstResult = executeAction(first, second, messages);

  if (firstResult) {
    messages.push(...firstResult.messages);

    if (firstResult.defenderFainted) {
      if (getAliveCount(second) === 0) {
        battleOver = true;
        winnerId = first.userId;
      } else {
        needsSwitch.push(second.userId);
      }
    }

    if (firstResult.attackerFainted) {
      if (getAliveCount(first) === 0) {
        battleOver = true;
        winnerId = second.userId;
      } else {
        needsSwitch.push(first.userId);
      }
    }
  }

  // --- Second player acts (only if not fainted and battle isn't over) ---
  let secondResult: MoveResult | null = null;

  if (!battleOver && second.pokemon.currentHp > 0) {
    messages.push("");
    secondResult = executeAction(second, first, messages);

    if (secondResult) {
      messages.push(...secondResult.messages);

      if (secondResult.defenderFainted) {
        if (getAliveCount(first) === 0) {
          battleOver = true;
          winnerId = second.userId;
        } else if (!needsSwitch.includes(first.userId)) {
          needsSwitch.push(first.userId);
        }
      }

      if (secondResult.attackerFainted) {
        if (getAliveCount(second) === 0) {
          battleOver = true;
          winnerId = first.userId;
        } else if (!needsSwitch.includes(second.userId)) {
          needsSwitch.push(second.userId);
        }
      }
    }
  }

  // Reset actions for next turn
  battle.player1.selectedAction = null;
  battle.player1.selectedMove = null;
  battle.player2.selectedAction = null;
  battle.player2.selectedMove = null;
  battle.turn++;
  battle.lastActionAt = Date.now();

  return {
    firstResult,
    secondResult,
    battleOver,
    winnerId,
    needsSwitch: battleOver ? [] : needsSwitch,
    messages,
  };
}
