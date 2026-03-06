/**
 * Battle state management.
 * All battle state is in-memory only -- nothing here touches the database.
 * Pokemon HP/PP during battle are ephemeral; the DB is never modified mid-battle.
 */

export interface BattleMove {
  moveId: number;
  name: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
  ppMax: number;
  category: "physical" | "special" | "status";
  priority: number;
  effectChance: number | null;
  statChanges: Array<{ stat: string; change: number }>;
}

export interface StatStages {
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
  accuracy: number;
  evasion: number;
}

export interface BattlePokemon {
  dbId: number;
  speciesId: number;
  name: string;
  level: number;
  types: string[];
  maxHp: number;
  currentHp: number;
  stats: {
    attack: number;
    defense: number;
    sp_attack: number;
    sp_defense: number;
    speed: number;
  };
  moves: BattleMove[];
  spriteUrl: string;
  isShiny: boolean;
  statStages: StatStages;
}

/** The action a player chose for this turn */
export type PlayerAction =
  | { type: "move"; moveIndex: number }
  | { type: "switch"; targetIndex: number }
  | null;

export interface BattlePlayer {
  userId: string;
  /** The full team (up to 6 Pokemon) */
  team: BattlePokemon[];
  /** Index into `team` for the currently active Pokemon */
  activePokemonIndex: number;
  /** Convenience getter-equivalent -- always points to team[activePokemonIndex] */
  pokemon: BattlePokemon;
  /** The action selected for this turn */
  selectedAction: PlayerAction;
  /** Legacy compat: move index shorthand (derived from selectedAction) */
  selectedMove: number | null;
}

export type BattlePhase =
  | "challenge"
  | "move_select"
  | "switching"   // A player must choose which Pokemon to send out after a faint
  | "resolving"
  | "ended";

export type BattleEndReason = "faint" | "forfeit" | "timeout";
export type BattleType = "pvp" | "wild" | "npc" | "gym";

export interface BattleState {
  id: string;
  channelId: string;
  guildId: string;
  messageId: string;
  battleType: BattleType;

  player1: BattlePlayer;
  player2: BattlePlayer;

  turn: number;
  phase: BattlePhase;
  turnLog: string[];
  startedAt: number;
  lastActionAt: number;
  turnTimeoutId: Timer | null;
  winner: string | null;
  endReason: BattleEndReason | null;

  /** Which player(s) need to switch (after faint). Set of userIds. */
  pendingSwitches: Set<string>;

  /** NPC trainer definition (only set for NPC battles). */
  npcTrainer?: any;
}

/** Maximum turn log entries per battle to prevent unbounded growth */
const MAX_TURN_LOG_SIZE = 50;

/** Stale battle threshold: 10 minutes without action */
const STALE_BATTLE_MS = 10 * 60 * 1000;

/** Reaper interval: check for stale battles every 2 minutes */
const REAPER_INTERVAL_MS = 2 * 60 * 1000;

/** Active battles indexed by battle ID */
export const activeBattles = new Map<string, BattleState>();

/** Quick lookup: userId -> battleId (prevents users from being in multiple battles) */
export const userBattleMap = new Map<string, string>();

/**
 * Append to a battle's turn log, capping at MAX_TURN_LOG_SIZE.
 */
export function addTurnLog(battle: BattleState, entry: string): void {
  battle.turnLog.push(entry);
  if (battle.turnLog.length > MAX_TURN_LOG_SIZE) {
    battle.turnLog.splice(0, battle.turnLog.length - MAX_TURN_LOG_SIZE);
  }
}

/**
 * Reap stale battles that haven't had activity in STALE_BATTLE_MS.
 */
function reapStaleBattles(): void {
  const now = Date.now();
  for (const [battleId, battle] of activeBattles) {
    if (now - battle.lastActionAt > STALE_BATTLE_MS) {
      cleanupBattle(battleId);
    }
  }
}

/** Battle reaper interval handle */
let battleReaperInterval: Timer | undefined = setInterval(reapStaleBattles, REAPER_INTERVAL_MS);

/**
 * Stop the battle reaper (call on shutdown).
 */
export function disposeBattleState(): void {
  if (battleReaperInterval) {
    clearInterval(battleReaperInterval);
    battleReaperInterval = undefined;
  }
  // Clean up all active battles
  for (const [battleId] of activeBattles) {
    cleanupBattle(battleId);
  }
}

/**
 * Generate a unique battle ID.
 */
export function generateBattleId(): string {
  return `battle_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Check if a user is currently in an active battle.
 */
export function isUserInBattle(userId: string): boolean {
  const battleId = userBattleMap.get(userId);
  if (!battleId) return false;

  if (!activeBattles.has(battleId)) {
    userBattleMap.delete(userId);
    return false;
  }

  return true;
}

/**
 * Get the active battle for a user, if any.
 */
export function getUserBattle(userId: string): BattleState | null {
  const battleId = userBattleMap.get(userId);
  if (!battleId) return null;

  const battle = activeBattles.get(battleId);
  if (!battle) {
    userBattleMap.delete(userId);
    return null;
  }

  return battle;
}

/**
 * Register a new battle in the state maps.
 */
export function registerBattle(battle: BattleState): void {
  activeBattles.set(battle.id, battle);
  userBattleMap.set(battle.player1.userId, battle.id);
  userBattleMap.set(battle.player2.userId, battle.id);
}

/**
 * Clean up a battle from all state maps and clear its timeout.
 */
export function cleanupBattle(battleId: string): void {
  const battle = activeBattles.get(battleId);
  if (!battle) return;

  if (battle.turnTimeoutId) {
    clearTimeout(battle.turnTimeoutId);
    battle.turnTimeoutId = null;
  }

  userBattleMap.delete(battle.player1.userId);
  userBattleMap.delete(battle.player2.userId);
  activeBattles.delete(battleId);
}

/**
 * Create default stat stages (all at 0 = neutral).
 */
export function defaultStatStages(): StatStages {
  return {
    attack: 0,
    defense: 0,
    sp_attack: 0,
    sp_defense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

/**
 * Create a BattlePlayer from a team of Pokemon.
 * The first Pokemon in the team is the initial active one.
 */
export function createBattlePlayer(userId: string, team: BattlePokemon[]): BattlePlayer {
  return {
    userId,
    team,
    activePokemonIndex: 0,
    pokemon: team[0],
    selectedAction: null,
    selectedMove: null,
  };
}

/**
 * Switch a player's active Pokemon. Resets stat stages for the new Pokemon.
 */
export function switchActivePokemon(player: BattlePlayer, newIndex: number): void {
  if (newIndex < 0 || newIndex >= player.team.length) return;
  if (player.team[newIndex].currentHp <= 0) return; // Can't switch to fainted

  player.activePokemonIndex = newIndex;
  player.pokemon = player.team[newIndex];
  // Reset stat stages on switch (standard Pokemon rules)
  player.pokemon.statStages = defaultStatStages();
}

/**
 * Get the number of alive (non-fainted) Pokemon on a player's team.
 */
export function getAliveCount(player: BattlePlayer): number {
  return player.team.filter((p) => p.currentHp > 0).length;
}

/**
 * Check if a player has any alive Pokemon left to switch to
 * (excluding their current active Pokemon).
 */
export function hasAliveSwitch(player: BattlePlayer): boolean {
  return player.team.some(
    (p, i) => i !== player.activePokemonIndex && p.currentHp > 0,
  );
}

/**
 * Get indices of alive Pokemon available for switching (excluding current active).
 */
export function getAliveSwitchIndices(player: BattlePlayer): number[] {
  return player.team
    .map((p, i) => ({ index: i, alive: p.currentHp > 0 }))
    .filter((p) => p.alive && p.index !== player.activePokemonIndex)
    .map((p) => p.index);
}

/**
 * Sync the player's convenience fields after an action is chosen.
 */
export function syncPlayerAction(player: BattlePlayer): void {
  if (player.selectedAction?.type === "move") {
    player.selectedMove = player.selectedAction.moveIndex;
  } else {
    player.selectedMove = null;
  }
}
