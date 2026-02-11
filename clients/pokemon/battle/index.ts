/**
 * Battle system re-exports.
 */

// State management
export {
  type BattleState,
  type BattlePlayer,
  type BattlePokemon,
  type BattleMove,
  type BattlePhase,
  type BattleEndReason,
  type BattleType,
  type StatStages,
  type PlayerAction,
  activeBattles,
  userBattleMap,
  generateBattleId,
  isUserInBattle,
  getUserBattle,
  registerBattle,
  cleanupBattle,
  defaultStatStages,
  createBattlePlayer,
  switchActivePokemon,
  getAliveCount,
  hasAliveSwitch,
  getAliveSwitchIndices,
  syncPlayerAction,
} from "./battle-state";

// Type effectiveness
export {
  TYPE_EFFECTIVENESS,
  getTypeMultiplier,
  getEffectivenessText,
  getStabMultiplier,
} from "./type-chart";

// Battle engine
export {
  calculateDamage,
  executeMove,
  determineTurnOrder,
  resolveTurn,
  type DamageResult,
  type MoveResult,
  type TurnResult,
} from "./battle-engine";

// Move management
export {
  getMonsterMoves,
  assignMovesToMonster,
  loadBattleMoves,
  restoreMovePP,
  STRUGGLE_MOVE,
} from "./battle-moves";

// UI
export {
  renderHPBar,
  buildBattleEmbed,
  buildChallengeEmbed,
  buildMoveButtons,
  buildSwitchButtons,
  buildWildMoveButtons,
  buildBattleOverEmbed,
  buildWaitingMessage,
  buildChallengeExpiredEmbed,
  sendMoveSelection,
} from "./battle-ui";

// Team management
export {
  handleTeamCommand,
  getUserTeam,
  getUserTeamMonsterIds,
} from "./team-manager";

// Rewards
export {
  calculateRewards,
  applyRewards,
  logBattle,
  getBattleCooldown,
  setBattleCooldown,
  shouldHalveRewards,
  type BattleRewards,
} from "./battle-rewards";

// Handler
export {
  startBattleChallenge,
  startWildBattle,
  startNpcBattle,
  startGymBattle,
  handleBattleButton,
} from "./battle-handler";

// Wild battles
export {
  isWildBattle,
  generateWildPokemon,
  selectWildMove,
  shouldShowCatchButton,
  attemptCatch,
  insertCaughtPokemon,
  calculateWildRewards,
  WILD_USER_ID,
} from "./battle-wild";

// NPC battles
export {
  type NpcDifficulty,
  type NpcTrainerDef,
  type NpcTrainerTeamMember,
  NPC_TRAINERS,
  NPC_USER_ID_PREFIX,
  getTrainerById,
  getTrainersByDifficulty,
  getNpcUserId,
  isNpcUser,
  buildNpcTeam,
  selectNpcMove,
  calculateNpcRewards,
  getTrainerProgress,
  getAllTrainerProgress,
  recordTrainerAttempt,
  getTrainerCooldown,
  buildTrainerListEmbed,
} from "./battle-npc";

// Gym battles
export {
  type GymDef,
  GYMS,
  getGymById,
  getGymByOrder,
  getNextGym,
  canChallengeGym,
  buildGymTeam,
  getUserBadges,
  hasBadge,
  awardBadge,
  recordGymAttempt,
  getBadgeCount,
  getGymCooldown,
  calculateGymRewards,
  buildGymListEmbed,
  buildBadgeEmbed,
  buildGymLeaderboardEmbed,
} from "./battle-gym";
