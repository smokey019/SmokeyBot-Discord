/**
 * Battle handler: orchestrates the full battle flow.
 * Handles challenge creation, button interactions, turn resolution, and cleanup.
 */

import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { databaseClient, getUser } from "../../database";
import { getLogger } from "../../logger";
import { queueMessage } from "../../message_queue";
import { MonsterTable, type IMonsterModel } from "../../../models/Monster";
import {
  findMonsterByID,
  getPokemonTypeColor,
  type Pokemon,
} from "../monsters";
import { calculateAllStats, getPokemonImages } from "../info";
import { capitalizeFirstLetter } from "../utils";
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
import { resolveTurn } from "./battle-engine";
import {
  buildChallengeEmbed,
  buildBattleEmbed,
  buildMoveButtons,
  buildSwitchButtons,
  buildBattleOverEmbed,
  buildChallengeExpiredEmbed,
} from "./battle-ui";
import { getUserTeamMonsterIds } from "./team-manager";
import {
  calculateRewards,
  applyRewards,
  logBattle,
  getBattleCooldown,
  setBattleCooldown,
  shouldHalveRewards,
} from "./battle-rewards";
import {
  isWildBattle,
  getHumanPlayer,
  getWildPlayer,
  selectWildMove,
  shouldShowCatchButton,
  attemptCatch,
  insertCaughtPokemon,
  generateWildPokemon,
  calculateWildRewards,
  WILD_USER_ID,
} from "./battle-wild";
import { buildWildMoveButtons } from "./battle-ui";
import {
  type NpcTrainerDef,
  getNpcUserId,
  isNpcUser,
  buildNpcTeam,
  selectNpcMove,
  calculateNpcRewards,
  recordTrainerAttempt,
} from "./battle-npc";
import {
  type GymDef,
  buildGymTeam,
  calculateGymRewards,
  awardBadge,
  recordGymAttempt,
  hasBadge,
} from "./battle-gym";

const logger = getLogger("BattleHandler");

const CHALLENGE_TIMEOUT_MS = 60_000; // 60 seconds to accept
const TURN_TIMEOUT_MS = 30_000; // 30 seconds per turn
const MAX_PENDING_CHALLENGES = 100;

/** Pending challenges: `${challengerId}_${targetId}` -> timeout timer */
const pendingChallenges = new Map<string, Timer>();

/**
 * Evict oldest pending challenges when over the cap.
 */
function enforcePendingChallengesCap(): void {
  while (pendingChallenges.size > MAX_PENDING_CHALLENGES) {
    const oldestKey = pendingChallenges.keys().next().value;
    if (!oldestKey) break;
    const timer = pendingChallenges.get(oldestKey);
    if (timer) clearTimeout(timer);
    pendingChallenges.delete(oldestKey);
  }
}

/**
 * Clean up all pending challenges (call on shutdown).
 */
export function disposePendingChallenges(): void {
  for (const [key, timer] of pendingChallenges) {
    clearTimeout(timer);
  }
  pendingChallenges.clear();
}

/**
 * Entry point: /battle @opponent
 */
export async function startBattleChallenge(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const challengerId = interaction.user.id;
  const targetUser = interaction.options.getUser("opponent");

  if (!targetUser) {
    await queueMessage("Please mention a user to battle.", interaction, true);
    return;
  }

  const targetId = targetUser.id;

  // Validation checks
  if (targetId === challengerId) {
    await queueMessage("You can't battle yourself!", interaction, true);
    return;
  }

  if (targetUser.bot) {
    await queueMessage("You can't battle a bot! Use `/trainer battle` for NPC battles.", interaction, true);
    return;
  }

  if (isUserInBattle(challengerId)) {
    await queueMessage("You're already in a battle! Finish it first.", interaction, true);
    return;
  }

  if (isUserInBattle(targetId)) {
    await queueMessage("That trainer is already in a battle!", interaction, true);
    return;
  }

  // Check cooldown
  const cooldown = getBattleCooldown(challengerId, targetId);
  if (cooldown > 0) {
    await queueMessage(
      `You must wait **${cooldown} seconds** before battling this trainer again.`,
      interaction,
      true,
    );
    return;
  }

  // Load both players' current Pokemon
  const [challengerUser, targetUserData] = await Promise.all([
    getUser(challengerId),
    getUser(targetId),
  ]);

  if (!challengerUser?.current_monster) {
    await queueMessage("You need to select a Pokemon first! Use `/select`.", interaction, true);
    return;
  }

  if (!targetUserData?.current_monster) {
    await queueMessage("Your opponent hasn't selected a Pokemon yet!", interaction, true);
    return;
  }

  // Load lead Pokemon data and team sizes
  const [challengerMonster, targetMonster, challengerTeamIds, targetTeamIds] = await Promise.all([
    loadMonsterData(challengerUser.current_monster),
    loadMonsterData(targetUserData.current_monster),
    getUserTeamMonsterIds(challengerId),
    getUserTeamMonsterIds(targetId),
  ]);

  if (!challengerMonster) {
    await queueMessage("Failed to load your Pokemon data. Please try again.", interaction, true);
    return;
  }

  if (!targetMonster) {
    await queueMessage("Failed to load your opponent's Pokemon data. Please try again.", interaction, true);
    return;
  }

  // Team size: at least 1 (the current_monster), up to 6 from battle_teams
  const challengerTeamSize = Math.max(1, challengerTeamIds.length);
  const targetTeamSize = Math.max(1, targetTeamIds.length);

  // Build and send challenge
  const { embed, components } = buildChallengeEmbed(
    challengerId,
    targetId,
    challengerMonster,
    targetMonster,
    challengerTeamSize,
    targetTeamSize,
  );

  await interaction.editReply({ embeds: [embed], components });

  // Set challenge timeout
  const challengeKey = `${challengerId}_${targetId}`;
  const timeout = setTimeout(async () => {
    pendingChallenges.delete(challengeKey);
    try {
      const expiredEmbed = buildChallengeExpiredEmbed(challengerId, targetId);
      await interaction.editReply({ embeds: [expiredEmbed], components: [] });
    } catch (error) {
      logger.warn("Failed to update expired challenge embed:", error);
    }
  }, CHALLENGE_TIMEOUT_MS);

  pendingChallenges.set(challengeKey, timeout);
  enforcePendingChallengesCap();
}

/**
 * Entry point: /battle wild
 * Generates a random wild Pokemon and starts a 1v1 battle immediately.
 */
export async function startWildBattle(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;

  if (isUserInBattle(userId)) {
    await queueMessage("You're already in a battle! Finish it first.", interaction, true);
    return;
  }

  // Load player data
  const userData = await getUser(userId);
  if (!userData?.current_monster) {
    await queueMessage("You need to select a Pokemon first! Use `/select`.", interaction, true);
    return;
  }

  // Build player's Pokemon (just current_monster for wild battles -- 1v1)
  const playerPokemon = await buildBattlePokemon(userData.current_monster);
  if (!playerPokemon) {
    await queueMessage("Failed to load your Pokemon data. Please try again.", interaction, true);
    return;
  }

  // Generate a wild Pokemon near the player's level
  const wildPokemon = await generateWildPokemon(playerPokemon.level);
  if (!wildPokemon) {
    await queueMessage("Failed to generate a wild Pokemon. Please try again.", interaction, true);
    return;
  }

  // Create battle state
  const battleId = generateBattleId();
  const battle: BattleState = {
    id: battleId,
    channelId: interaction.channelId!,
    guildId: interaction.guildId || "",
    messageId: "", // Will be set after sending
    battleType: "wild",
    player1: createBattlePlayer(userId, [playerPokemon]),
    player2: createBattlePlayer(WILD_USER_ID, [wildPokemon]),
    turn: 1,
    phase: "move_select",
    turnLog: [],
    startedAt: Date.now(),
    lastActionAt: Date.now(),
    turnTimeoutId: null,
    winner: null,
    endReason: null,
    pendingSwitches: new Set(),
  };

  registerBattle(battle);

  // Send initial battle embed
  const battleEmbed = buildBattleEmbed(battle, [`A wild **${wildPokemon.name}** (Lv. ${wildPokemon.level}) appeared!`]);
  const reply = await interaction.editReply({ embeds: [battleEmbed] });
  battle.messageId = reply.id;

  // Send move selection to the player only (wild Pokemon auto-selects)
  await sendWildMoveSelection(interaction, battle);
  startTurnTimeout(battle);
}

/**
 * Entry point: /trainer battle <trainer>
 * Builds an NPC team and starts a team battle against the NPC.
 */
export async function startNpcBattle(
  interaction: ChatInputCommandInteraction,
  trainer: NpcTrainerDef,
): Promise<void> {
  const userId = interaction.user.id;

  if (isUserInBattle(userId)) {
    await queueMessage("You're already in a battle! Finish it first.", interaction, true);
    return;
  }

  // Load player data
  const userData = await getUser(userId);
  if (!userData?.current_monster) {
    await queueMessage("You need to select a Pokemon first! Use `/select`.", interaction, true);
    return;
  }

  // Build player's team
  const playerTeamIds = await getUserTeamMonsterIds(userId);
  const playerTeam = await buildTeam(playerTeamIds, userData.current_monster);

  if (playerTeam.length === 0) {
    await queueMessage("Failed to load your Pokemon data. Please try again.", interaction, true);
    return;
  }

  // Build NPC team
  const npcTeam = await buildNpcTeam(trainer);
  if (npcTeam.length === 0) {
    await queueMessage("Failed to generate NPC trainer's team. Please try again.", interaction, true);
    return;
  }

  // Create battle state
  const npcUserId = getNpcUserId(trainer.id);
  const battleId = generateBattleId();
  const battle: BattleState = {
    id: battleId,
    channelId: interaction.channelId!,
    guildId: interaction.guildId || "",
    messageId: "",
    battleType: "npc",
    player1: createBattlePlayer(userId, playerTeam),
    player2: createBattlePlayer(npcUserId, npcTeam),
    turn: 1,
    phase: "move_select",
    turnLog: [],
    startedAt: Date.now(),
    lastActionAt: Date.now(),
    turnTimeoutId: null,
    winner: null,
    endReason: null,
    pendingSwitches: new Set(),
    npcTrainer: trainer,
  };

  registerBattle(battle);

  // Send initial battle embed
  const teamPreview = npcTeam.map((p) => `${p.name} (Lv.${p.level})`).join(", ");
  const battleEmbed = buildBattleEmbed(battle, [
    `**${trainer.title} ${trainer.name}** wants to battle!`,
    `NPC Team: ${teamPreview}`,
  ]);
  const reply = await interaction.editReply({ embeds: [battleEmbed] });
  battle.messageId = reply.id;

  // Send move selection to the player only (NPC auto-selects)
  await sendNpcMoveSelection(interaction, battle);
  startTurnTimeout(battle);
}

/**
 * Entry point: /gym challenge [number]
 * Builds a gym leader team and starts a gym battle.
 */
export async function startGymBattle(
  interaction: ChatInputCommandInteraction,
  gym: GymDef,
): Promise<void> {
  const userId = interaction.user.id;

  if (isUserInBattle(userId)) {
    await queueMessage("You're already in a battle! Finish it first.", interaction, true);
    return;
  }

  // Load player data
  const userData = await getUser(userId);
  if (!userData?.current_monster) {
    await queueMessage("You need to select a Pokemon first! Use `/select`.", interaction, true);
    return;
  }

  // Build player's team
  const playerTeamIds = await getUserTeamMonsterIds(userId);
  const playerTeam = await buildTeam(playerTeamIds, userData.current_monster);

  if (playerTeam.length === 0) {
    await queueMessage("Failed to load your Pokemon data. Please try again.", interaction, true);
    return;
  }

  // Build gym leader team
  const gymTeam = await buildGymTeam(gym);
  if (gymTeam.length === 0) {
    await queueMessage("Failed to generate Gym Leader's team. Please try again.", interaction, true);
    return;
  }

  // Create battle state (gym uses NPC user ID prefix)
  const gymUserId = getNpcUserId(gym.id);
  const battleId = generateBattleId();
  const battle: BattleState = {
    id: battleId,
    channelId: interaction.channelId!,
    guildId: interaction.guildId || "",
    messageId: "",
    battleType: "gym",
    player1: createBattlePlayer(userId, playerTeam),
    player2: createBattlePlayer(gymUserId, gymTeam),
    turn: 1,
    phase: "move_select",
    turnLog: [],
    startedAt: Date.now(),
    lastActionAt: Date.now(),
    turnTimeoutId: null,
    winner: null,
    endReason: null,
    pendingSwitches: new Set(),
    npcTrainer: gym, // Store gym def on npcTrainer field for reuse
  };

  registerBattle(battle);

  // Send initial battle embed
  const teamPreview = gymTeam.map((p) => `${p.name} (Lv.${p.level})`).join(", ");
  const battleEmbed = buildBattleEmbed(battle, [
    `${gym.badgeEmoji} **Gym #${gym.order}: ${gym.name}**`,
    `**${gym.leaderTitle} ${gym.leaderName}** challenges you!`,
    `Leader's Team: ${teamPreview}`,
  ]);
  const reply = await interaction.editReply({ embeds: [battleEmbed] });
  battle.messageId = reply.id;

  // Send move selection to the player only (gym leader auto-selects)
  await sendNpcMoveSelection(interaction, battle);
  startTurnTimeout(battle);
}

/**
 * Handle all battle-related button interactions.
 * Called from bot.ts when a button with `battle_` prefix is clicked.
 */
export async function handleBattleButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    if (customId.startsWith("battle_accept_")) {
      await handleAccept(interaction);
    } else if (customId.startsWith("battle_decline_")) {
      await handleDecline(interaction);
    } else if (customId.startsWith("battle_move_")) {
      await handleMoveSelection(interaction);
    } else if (customId.startsWith("battle_switchmenu_")) {
      await handleSwitchMenu(interaction);
    } else if (customId.startsWith("battle_switch_")) {
      await handleSwitch(interaction);
    } else if (customId.startsWith("battle_catch_")) {
      await handleCatch(interaction);
    } else if (customId.startsWith("battle_run_")) {
      await handleRun(interaction);
    } else if (customId.startsWith("battle_forfeit_")) {
      await handleForfeit(interaction);
    }
  } catch (error) {
    logger.error(`Error handling battle button ${customId}:`, error);
    try {
      await interaction.reply({
        content: "Something went wrong with the battle. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      // Interaction may have already been acknowledged
    }
  }
}

/**
 * Handle challenge acceptance.
 */
async function handleAccept(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  // battle_accept_{challengerId}_{targetId}
  const challengerId = parts[2];
  const targetId = parts[3];

  // Only the target can accept
  if (interaction.user.id !== targetId) {
    await interaction.reply({
      content: "Only the challenged trainer can accept!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Clear challenge timeout
  const challengeKey = `${challengerId}_${targetId}`;
  const timeout = pendingChallenges.get(challengeKey);
  if (timeout) {
    clearTimeout(timeout);
    pendingChallenges.delete(challengeKey);
  } else {
    await interaction.reply({
      content: "This challenge has expired or was already handled.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Recheck that neither is in a battle (race condition guard)
  if (isUserInBattle(challengerId) || isUserInBattle(targetId)) {
    await interaction.reply({
      content: "One of the trainers is now in another battle!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  // Load user data and team IDs for both players
  const [challengerUser, targetUserData, challengerTeamIds, targetTeamIds] = await Promise.all([
    getUser(challengerId),
    getUser(targetId),
    getUserTeamMonsterIds(challengerId),
    getUserTeamMonsterIds(targetId),
  ]);

  // Build full teams: use battle_teams if set, otherwise fall back to current_monster
  const challengerTeam = await buildTeam(challengerTeamIds, challengerUser.current_monster);
  const targetTeam = await buildTeam(targetTeamIds, targetUserData.current_monster);

  if (challengerTeam.length === 0 || targetTeam.length === 0) {
    await interaction.editReply({
      content: "Failed to load Pokemon data. Battle cancelled.",
      embeds: [],
      components: [],
    });
    return;
  }

  // Create battle state with full teams
  const battleId = generateBattleId();
  const battle: BattleState = {
    id: battleId,
    channelId: interaction.channelId,
    guildId: interaction.guildId || "",
    messageId: interaction.message.id,
    battleType: "pvp",
    player1: createBattlePlayer(challengerId, challengerTeam),
    player2: createBattlePlayer(targetId, targetTeam),
    turn: 1,
    phase: "move_select",
    turnLog: [],
    startedAt: Date.now(),
    lastActionAt: Date.now(),
    turnTimeoutId: null,
    winner: null,
    endReason: null,
    pendingSwitches: new Set(),
  };

  registerBattle(battle);

  // Send initial battle embed
  const battleEmbed = buildBattleEmbed(battle, ["The battle begins!"]);
  await interaction.editReply({ embeds: [battleEmbed], components: [] });

  // Send move selection to both players
  await sendMoveSelectionsToPlayers(interaction, battle);

  // Start turn timeout
  startTurnTimeout(battle);
}

/**
 * Handle challenge decline.
 */
async function handleDecline(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  const challengerId = parts[2];
  const targetId = parts[3];

  if (interaction.user.id !== targetId) {
    await interaction.reply({
      content: "Only the challenged trainer can decline!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Clear challenge timeout
  const challengeKey = `${challengerId}_${targetId}`;
  const timeout = pendingChallenges.get(challengeKey);
  if (timeout) {
    clearTimeout(timeout);
    pendingChallenges.delete(challengeKey);
  }

  await interaction.update({
    content: `<@${targetId}> declined the battle challenge.`,
    embeds: [],
    components: [],
  });
}

/**
 * Handle move selection button press.
 */
async function handleMoveSelection(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  // battle_move_{battleId}_{userId}_{moveIndex}
  const battleId = parts.slice(2, parts.length - 2).join("_"); // Handle underscore in battleId
  const userId = parts[parts.length - 2];
  const moveIndex = parseInt(parts[parts.length - 1]);

  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "These aren't your battle buttons!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const battle = activeBattles.get(battleId);

  if (!battle || battle.phase !== "move_select") {
    await interaction.reply({
      content: "This battle is no longer active.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const player = getPlayerFromBattle(battle, userId);

  if (!player) {
    await interaction.reply({
      content: "You're not part of this battle!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (player.selectedAction !== null) {
    await interaction.reply({
      content: "You've already selected an action this turn!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Record move selection
  player.selectedAction = { type: "move", moveIndex };
  player.selectedMove = moveIndex;

  const isSoloBattle = isWildBattle(battle) || isNpcBattle(battle);

  await interaction.reply({
    content: `You chose **${player.pokemon.moves[moveIndex]?.name || "???"}**!${isSoloBattle ? "" : " Waiting for opponent..."}`,
    flags: MessageFlags.Ephemeral,
  });

  // In wild battles, auto-select the wild Pokemon's move immediately
  if (isWildBattle(battle)) {
    const wildPlayer = getWildPlayer(battle);
    const wildMoveIndex = selectWildMove(wildPlayer.pokemon);
    wildPlayer.selectedAction = { type: "move", moveIndex: wildMoveIndex };
    wildPlayer.selectedMove = wildMoveIndex;
  }

  // In NPC battles, auto-select the NPC's move based on difficulty AI
  if (isNpcBattle(battle) && battle.npcTrainer) {
    const npcPlayer = battle.player2;
    const humanPlayer = battle.player1;
    const npcMoveIndex = selectNpcMove(
      battle.npcTrainer.difficulty,
      npcPlayer.pokemon,
      humanPlayer.pokemon,
    );
    npcPlayer.selectedAction = { type: "move", moveIndex: npcMoveIndex };
    npcPlayer.selectedMove = npcMoveIndex;
  }

  // Check if both players have selected
  if (battle.player1.selectedAction !== null && battle.player2.selectedAction !== null) {
    await resolveBattleTurn(interaction, battle);
  }
}

/**
 * Handle "Switch Pokemon" menu button (during move_select phase).
 * Shows the player their available Pokemon to switch to.
 */
async function handleSwitchMenu(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  // battle_switchmenu_{battleId}_{userId}
  const userId = parts[parts.length - 1];
  const battleId = parts.slice(2, parts.length - 1).join("_");

  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "These aren't your battle buttons!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const battle = activeBattles.get(battleId);

  if (!battle || (battle.phase !== "move_select" && battle.phase !== "switching")) {
    await interaction.reply({
      content: "This battle is no longer active or it's not time to switch.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const player = getPlayerFromBattle(battle, userId);
  if (!player) {
    await interaction.reply({
      content: "You're not part of this battle!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show switch buttons
  const switchComponents = buildSwitchButtons(battle.id, userId, player);
  await interaction.reply({
    content: "Choose a Pokemon to switch to:",
    components: switchComponents,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle a specific switch selection (choosing which Pokemon to send out).
 * Works for both voluntary switches (during move_select) and forced switches (after faint).
 */
async function handleSwitch(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  // battle_switch_{battleId}_{userId}_{teamIndex}
  const teamIndex = parseInt(parts[parts.length - 1]);
  const userId = parts[parts.length - 2];
  const battleId = parts.slice(2, parts.length - 2).join("_");

  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "These aren't your battle buttons!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const battle = activeBattles.get(battleId);

  if (!battle) {
    await interaction.reply({
      content: "This battle is no longer active.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const player = getPlayerFromBattle(battle, userId);
  if (!player) {
    await interaction.reply({
      content: "You're not part of this battle!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Forced switch after faint
  if (battle.phase === "switching" && battle.pendingSwitches.has(userId)) {
    const { switchActivePokemon } = await import("./battle-state");
    const oldName = player.pokemon.name;
    switchActivePokemon(player, teamIndex);

    battle.pendingSwitches.delete(userId);

    await interaction.reply({
      content: `You sent out **${player.pokemon.name}**!`,
      flags: MessageFlags.Ephemeral,
    });

    // Update battle embed to show the switch
    try {
      const channel = interaction.channel;
      if (channel) {
        const switchMessages = [...battle.turnLog, `<@${userId}> sent out **${player.pokemon.name}** (replacing ${oldName})!`];
        const battleEmbed = buildBattleEmbed(battle, switchMessages);
        const msg = await channel.messages.fetch(battle.messageId);
        await msg.edit({ embeds: [battleEmbed] });
      }
    } catch (error) {
      logger.warn("Failed to update battle embed after switch:", error);
    }

    // If all pending switches resolved, continue to next turn
    if (battle.pendingSwitches.size === 0) {
      battle.phase = "move_select";
      await sendMoveSelectionsToPlayers(interaction, battle);
      startTurnTimeout(battle);
    }
    return;
  }

  // Voluntary switch during move_select phase
  if (battle.phase === "move_select") {
    if (player.selectedAction !== null) {
      await interaction.reply({
        content: "You've already selected an action this turn!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    player.selectedAction = { type: "switch", targetIndex: teamIndex };
    player.selectedMove = null;

    const isSoloBattle = isWildBattle(battle) || isNpcBattle(battle);

    await interaction.reply({
      content: `You'll switch to **${player.team[teamIndex].name}**!${isSoloBattle ? "" : " Waiting for opponent..."}`,
      flags: MessageFlags.Ephemeral,
    });

    // In NPC battles, auto-select the NPC's move
    if (isNpcBattle(battle) && battle.npcTrainer) {
      const npcPlayer = battle.player2;
      const humanPlayer = battle.player1;
      const npcMoveIndex = selectNpcMove(
        battle.npcTrainer.difficulty,
        npcPlayer.pokemon,
        humanPlayer.pokemon,
      );
      npcPlayer.selectedAction = { type: "move", moveIndex: npcMoveIndex };
      npcPlayer.selectedMove = npcMoveIndex;
    }

    // Check if both players have selected
    if (battle.player1.selectedAction !== null && battle.player2.selectedAction !== null) {
      await resolveBattleTurn(interaction, battle);
    }
    return;
  }

  await interaction.reply({
    content: "It's not the right time to switch.",
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle catch attempt button press (wild battles only).
 */
async function handleCatch(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  // battle_catch_{battleId}_{userId}
  const userId = parts[parts.length - 1];
  const battleId = parts.slice(2, parts.length - 1).join("_");

  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "These aren't your battle buttons!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const battle = activeBattles.get(battleId);
  if (!battle || !isWildBattle(battle)) {
    await interaction.reply({
      content: "This battle is no longer active.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const wildPokemon = getWildPlayer(battle).pokemon;

  if (!shouldShowCatchButton(wildPokemon)) {
    await interaction.reply({
      content: "The wild Pokemon's HP is too high to catch!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const caught = attemptCatch(wildPokemon);

  if (caught) {
    // Insert into DB
    const result = await insertCaughtPokemon(userId, wildPokemon);

    battle.phase = "ended";
    battle.endReason = "faint"; // Using "faint" as closest match
    battle.winner = userId;

    const catchMessages = [
      `You threw a Pokeball at **${wildPokemon.name}**...`,
      `**CAUGHT!** You caught the wild **${wildPokemon.name}**!`,
    ];

    if (result) {
      catchMessages.push(`Avg IV: **${result.avgIv}%** | ID: **${result.dbId}**${result.isShiny ? " | **SHINY!**" : ""}`);
    }

    await interaction.deferUpdate();

    try {
      const channel = interaction.channel;
      if (channel) {
        const endEmbed = buildBattleOverEmbed(battle, userId, catchMessages);
        endEmbed.setTitle("Pokemon Caught!");
        endEmbed.setColor(0x41c600);
        const msg = await channel.messages.fetch(battle.messageId);
        await msg.edit({ embeds: [endEmbed], components: [] });
      }
    } catch (error) {
      logger.warn("Failed to update battle embed after catch:", error);
    }

    cleanupBattle(battle.id);
  } else {
    // Catch failed -- wild Pokemon gets a free attack
    await interaction.reply({
      content: `The wild **${wildPokemon.name}** broke free! It attacks while you fumble with the Pokeball!`,
      flags: MessageFlags.Ephemeral,
    });

    // Wild attacks on failed catch (wastes the player's turn)
    const humanPlayer = getHumanPlayer(battle);
    humanPlayer.selectedAction = { type: "move", moveIndex: -1 }; // Struggle/no-op
    humanPlayer.selectedMove = -1;

    const wildPlayer = getWildPlayer(battle);
    const wildMoveIndex = selectWildMove(wildPlayer.pokemon);
    wildPlayer.selectedAction = { type: "move", moveIndex: wildMoveIndex };
    wildPlayer.selectedMove = wildMoveIndex;

    await resolveBattleTurn(interaction, battle);
  }
}

/**
 * Handle run button (wild battles only -- flee from wild Pokemon).
 */
async function handleRun(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  // battle_run_{battleId}_{userId}
  const userId = parts[parts.length - 1];
  const battleId = parts.slice(2, parts.length - 1).join("_");

  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "These aren't your battle buttons!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const battle = activeBattles.get(battleId);
  if (!battle || !isWildBattle(battle)) {
    await interaction.reply({
      content: "This battle is no longer active.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  battle.phase = "ended";
  battle.endReason = "forfeit";
  battle.winner = null;

  await interaction.deferUpdate();

  try {
    const channel = interaction.channel;
    if (channel) {
      const wildName = getWildPlayer(battle).pokemon.name;
      const endEmbed = buildBattleOverEmbed(battle, null, [`<@${userId}> ran away from the wild **${wildName}**!`]);
      endEmbed.setTitle("Got Away Safely!");
      endEmbed.setColor(0x808080);
      const msg = await channel.messages.fetch(battle.messageId);
      await msg.edit({ embeds: [endEmbed], components: [] });
    }
  } catch (error) {
    logger.warn("Failed to update battle embed after run:", error);
  }

  cleanupBattle(battle.id);
}

/**
 * Handle forfeit button press.
 */
async function handleForfeit(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split("_");
  // battle_forfeit_{battleId}_{userId}
  const userId = parts[parts.length - 1];
  const battleId = parts.slice(2, parts.length - 1).join("_");

  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "These aren't your battle buttons!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const battle = activeBattles.get(battleId);

  if (!battle) {
    await interaction.reply({
      content: "This battle is no longer active.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const winnerId = battle.player1.userId === userId ? battle.player2.userId : battle.player1.userId;
  battle.winner = winnerId;
  battle.endReason = "forfeit";
  battle.phase = "ended";

  await interaction.deferUpdate();
  await endBattle(interaction, battle, winnerId, [`<@${userId}> forfeited the battle!`]);
}

/**
 * Resolve a battle turn after both players selected moves.
 */
async function resolveBattleTurn(
  interaction: ButtonInteraction,
  battle: BattleState,
): Promise<void> {
  // Clear turn timeout
  if (battle.turnTimeoutId) {
    clearTimeout(battle.turnTimeoutId);
    battle.turnTimeoutId = null;
  }

  battle.phase = "resolving";

  const turnResult = resolveTurn(battle);

  if (turnResult.battleOver) {
    battle.winner = turnResult.winnerId;
    battle.endReason = "faint";
    battle.phase = "ended";
    await endBattle(interaction, battle, turnResult.winnerId, turnResult.messages);
  } else if (turnResult.needsSwitch.length > 0) {
    // A Pokemon fainted in a team battle -- player(s) need to switch
    battle.phase = "switching";
    battle.pendingSwitches = new Set(turnResult.needsSwitch);
    battle.turnLog = turnResult.messages;

    // Auto-switch for NPC/wild players (they don't use buttons)
    const { switchActivePokemon, getAliveSwitchIndices: getAliveIndices } = await import("./battle-state");
    const humanSwitchNeeded: string[] = [];

    for (const switchUserId of turnResult.needsSwitch) {
      if (isNpcUser(switchUserId) || switchUserId === WILD_USER_ID) {
        const npcPlayer = getPlayerFromBattle(battle, switchUserId);
        if (npcPlayer) {
          const aliveIndices = getAliveIndices(npcPlayer);
          if (aliveIndices.length > 0) {
            // NPC picks the first alive Pokemon
            switchActivePokemon(npcPlayer, aliveIndices[0]);
            battle.pendingSwitches.delete(switchUserId);
            turnResult.messages.push(`${npcPlayer.pokemon.name} was sent out by the opponent!`);
          }
        }
      } else {
        humanSwitchNeeded.push(switchUserId);
      }
    }

    // Update battle embed
    try {
      const channel = interaction.channel;
      if (channel) {
        const battleEmbed = buildBattleEmbed(battle, turnResult.messages);
        const msg = await channel.messages.fetch(battle.messageId);
        await msg.edit({ embeds: [battleEmbed] });
      }
    } catch (error) {
      logger.warn("Failed to update battle embed:", error);
    }

    // If all switches resolved (NPC only needed to switch), go to next turn
    if (battle.pendingSwitches.size === 0) {
      battle.phase = "move_select";
      await sendMoveSelectionsToPlayers(interaction, battle);
      startTurnTimeout(battle);
    } else {
      // Human player(s) still need to switch
      await sendSwitchSelectionsToPlayers(interaction, battle, humanSwitchNeeded);
      startTurnTimeout(battle);
    }
  } else {
    // Normal turn -- no faints, continue to next turn
    battle.phase = "move_select";
    battle.turnLog = turnResult.messages;

    try {
      const channel = interaction.channel;
      if (channel) {
        const battleEmbed = buildBattleEmbed(battle, turnResult.messages);
        const msg = await channel.messages.fetch(battle.messageId);
        await msg.edit({ embeds: [battleEmbed] });
      }
    } catch (error) {
      logger.warn("Failed to update battle embed:", error);
    }

    // Send new move selections
    await sendMoveSelectionsToPlayers(interaction, battle);
    startTurnTimeout(battle);
  }
}

/**
 * End a battle: show results, apply rewards, log, and cleanup.
 */
async function endBattle(
  interaction: ButtonInteraction,
  battle: BattleState,
  winnerId: string | null,
  messages: string[],
): Promise<void> {
  // Calculate rewards
  let rewards = { winnerXp: 0, loserXp: 0, winnerCurrency: 0, loserCurrency: 0, rewardsHalved: false };

  if (isWildBattle(battle)) {
    // Wild battle rewards: only the human player gets rewards
    const humanPlayer = getHumanPlayer(battle);
    const wildPlayer = getWildPlayer(battle);
    const playerWon = winnerId === humanPlayer.userId;

    if (playerWon) {
      const halved = await shouldHalveRewards(humanPlayer.userId);
      const wildRewards = calculateWildRewards(humanPlayer.pokemon.level, wildPlayer.pokemon.level, halved);

      // Apply XP to player's Pokemon
      try {
        const { MonsterTable } = await import("../../../models/Monster");
        const { databaseClient } = await import("../../database");
        const { MonsterUserTable } = await import("../../../models/MonsterUser");

        await databaseClient(MonsterTable)
          .where("id", humanPlayer.pokemon.dbId)
          .increment("experience", wildRewards.xp);

        await databaseClient(MonsterUserTable)
          .where("uid", humanPlayer.userId)
          .increment("currency", wildRewards.currency);

        rewards.winnerXp = wildRewards.xp;
        rewards.winnerCurrency = wildRewards.currency;
      } catch (error) {
        logger.error("Error applying wild battle rewards:", error);
      }
    }
    // No cooldown for wild battles
  } else if (isGymBattle(battle) && battle.npcTrainer) {
    // Gym battle rewards: badge awarding + gym-specific rewards
    const humanPlayer = battle.player1;
    const playerWon = winnerId === humanPlayer.userId;
    const gym = battle.npcTrainer as GymDef;

    // Record progress via NPC progress table (for cooldown tracking)
    await recordTrainerAttempt(humanPlayer.userId, gym.id, playerWon);

    if (playerWon) {
      // Award badge (or increment attempts if already earned)
      const alreadyHadBadge = await hasBadge(humanPlayer.userId, gym.id);
      await awardBadge(humanPlayer.userId, gym.id);
      const firstWin = !alreadyHadBadge;

      const halved = await shouldHalveRewards(humanPlayer.userId);
      const gymRewards = calculateGymRewards(gym, humanPlayer.pokemon.level, halved, firstWin);

      try {
        const teamSize = humanPlayer.team.length;
        const xpPerMon = Math.max(1, Math.floor(gymRewards.xp / teamSize));

        for (const mon of humanPlayer.team) {
          if (mon.dbId > 0) {
            await databaseClient(MonsterTable)
              .where("id", mon.dbId)
              .increment("experience", xpPerMon);
          }
        }

        const { MonsterUserTable } = await import("../../../models/MonsterUser");
        await databaseClient(MonsterUserTable)
          .where("uid", humanPlayer.userId)
          .increment("currency", gymRewards.currency);

        rewards.winnerXp = gymRewards.xp;
        rewards.winnerCurrency = gymRewards.currency;
        rewards.rewardsHalved = halved;
      } catch (error) {
        logger.error("Error applying gym battle rewards:", error);
      }

      // Add badge award to messages
      if (firstWin) {
        messages.push(`${gym.badgeEmoji} You earned the **${gym.badgeName}**!`);
      } else {
        messages.push(`You already have the **${gym.badgeName}**, but great fight!`);
      }
    } else {
      // Record gym loss attempt
      await recordGymAttempt(humanPlayer.userId, gym.id);
    }
    // No PvP cooldown for gym battles
  } else if (isNpcBattle(battle) && !isGymBattle(battle) && battle.npcTrainer) {
    // NPC trainer battle rewards
    const humanPlayer = battle.player1;
    const playerWon = winnerId === humanPlayer.userId;
    const trainer = battle.npcTrainer as NpcTrainerDef;

    // Record the attempt (win or loss)
    await recordTrainerAttempt(humanPlayer.userId, trainer.id, playerWon);

    if (playerWon) {
      const halved = await shouldHalveRewards(humanPlayer.userId);
      const npcRewards = calculateNpcRewards(trainer, humanPlayer.pokemon.level, halved);

      try {
        const teamSize = humanPlayer.team.length;
        const xpPerMon = Math.max(1, Math.floor(npcRewards.xp / teamSize));

        for (const mon of humanPlayer.team) {
          if (mon.dbId > 0) {
            await databaseClient(MonsterTable)
              .where("id", mon.dbId)
              .increment("experience", xpPerMon);
          }
        }

        const { MonsterUserTable } = await import("../../../models/MonsterUser");
        await databaseClient(MonsterUserTable)
          .where("uid", humanPlayer.userId)
          .increment("currency", npcRewards.currency);

        rewards.winnerXp = npcRewards.xp;
        rewards.winnerCurrency = npcRewards.currency;
        rewards.rewardsHalved = halved;
      } catch (error) {
        logger.error("Error applying NPC battle rewards:", error);
      }
    }
    // No PvP cooldown for NPC battles
  } else if (winnerId) {
    // PvP rewards
    const winnerPlayer = winnerId === battle.player1.userId ? battle.player1 : battle.player2;
    const loserPlayer = winnerId === battle.player1.userId ? battle.player2 : battle.player1;
    const winnerMaxLevel = Math.max(...winnerPlayer.team.map(p => p.level));
    const loserMaxLevel = Math.max(...loserPlayer.team.map(p => p.level));
    const halved = await shouldHalveRewards(winnerId);
    rewards = calculateRewards(winnerMaxLevel, loserMaxLevel, halved);

    await applyRewards(battle, winnerId, rewards);
    // Set cooldown between PvP players
    setBattleCooldown(battle.player1.userId, battle.player2.userId);
  }

  // Log the battle
  await logBattle(battle, winnerId, rewards);

  // Send final battle embed
  try {
    const channel = interaction.channel;
    if (channel) {
      const endEmbed = buildBattleOverEmbed(battle, winnerId, messages, rewards);
      const msg = await channel.messages.fetch(battle.messageId);
      await msg.edit({ embeds: [endEmbed], components: [] });
    }
  } catch (error) {
    logger.warn("Failed to send battle over embed:", error);
  }

  // Cleanup
  cleanupBattle(battle.id);
}

/**
 * Send move selection buttons to both players.
 * Passes the full player object so the Switch button appears in team battles.
 * In wild battles, only sends to the human player.
 */
async function sendMoveSelectionsToPlayers(
  interaction: ButtonInteraction,
  battle: BattleState,
): Promise<void> {
  const channel = interaction.channel;
  if (!channel) return;

  if (isWildBattle(battle)) {
    // Wild battles: only send to the human player with wild-specific buttons
    const humanPlayer = getHumanPlayer(battle);
    const wildPokemon = getWildPlayer(battle).pokemon;
    try {
      const components = buildWildMoveButtons(battle.id, humanPlayer.userId, humanPlayer.pokemon, wildPokemon);
      await channel.send({
        content: `<@${humanPlayer.userId}> - **${humanPlayer.pokemon.name}**, choose your action:`,
        components,
      });
    } catch (error) {
      logger.warn(`Failed to send wild move selection to ${humanPlayer.userId}:`, error);
    }
    return;
  }

  if (isNpcBattle(battle)) {
    // NPC battles: only send to the human player (player1) with normal move buttons + switch
    const humanPlayer = battle.player1;
    try {
      const p1Components = buildMoveButtons(battle.id, humanPlayer.userId, humanPlayer.pokemon, humanPlayer);
      await channel.send({
        content: `<@${humanPlayer.userId}> - **${humanPlayer.pokemon.name}**, choose your move:`,
        components: p1Components,
      });
    } catch (error) {
      logger.warn(`Failed to send NPC move selection to ${humanPlayer.userId}:`, error);
    }
    return;
  }

  // PvP: send to both players
  try {
    const p1Components = buildMoveButtons(battle.id, battle.player1.userId, battle.player1.pokemon, battle.player1);
    await channel.send({
      content: `<@${battle.player1.userId}> - **${battle.player1.pokemon.name}**, choose your move:`,
      components: p1Components,
    });
  } catch (error) {
    logger.warn(`Failed to send move selection to player1 ${battle.player1.userId}:`, error);
  }

  try {
    const p2Components = buildMoveButtons(battle.id, battle.player2.userId, battle.player2.pokemon, battle.player2);
    await channel.send({
      content: `<@${battle.player2.userId}> - **${battle.player2.pokemon.name}**, choose your move:`,
      components: p2Components,
    });
  } catch (error) {
    logger.warn(`Failed to send move selection to player2 ${battle.player2.userId}:`, error);
  }
}

/**
 * Send wild battle move selection (for the initial turn via ChatInputCommandInteraction).
 */
async function sendWildMoveSelection(
  interaction: ChatInputCommandInteraction,
  battle: BattleState,
): Promise<void> {
  const channel = interaction.channel;
  if (!channel) return;

  const humanPlayer = getHumanPlayer(battle);
  const wildPokemon = getWildPlayer(battle).pokemon;

  try {
    const components = buildWildMoveButtons(battle.id, humanPlayer.userId, humanPlayer.pokemon, wildPokemon);
    await channel.send({
      content: `<@${humanPlayer.userId}> - **${humanPlayer.pokemon.name}**, choose your action:`,
      components,
    });
  } catch (error) {
    logger.warn(`Failed to send wild move selection to ${humanPlayer.userId}:`, error);
  }
}

/**
 * Send NPC battle move selection (for the initial turn via ChatInputCommandInteraction).
 */
async function sendNpcMoveSelection(
  interaction: ChatInputCommandInteraction,
  battle: BattleState,
): Promise<void> {
  const channel = interaction.channel;
  if (!channel) return;

  const humanPlayer = battle.player1;

  try {
    const p1Components = buildMoveButtons(battle.id, humanPlayer.userId, humanPlayer.pokemon, humanPlayer);
    await channel.send({
      content: `<@${humanPlayer.userId}> - **${humanPlayer.pokemon.name}**, choose your move:`,
      components: p1Components,
    });
  } catch (error) {
    logger.warn(`Failed to send NPC move selection to ${humanPlayer.userId}:`, error);
  }
}

/**
 * Check if a battle is an NPC battle (includes gym battles since gym leaders are NPCs).
 */
function isNpcBattle(battle: BattleState): boolean {
  return battle.battleType === "npc" || battle.battleType === "gym";
}

/**
 * Check if a battle is specifically a gym battle.
 */
function isGymBattle(battle: BattleState): boolean {
  return battle.battleType === "gym";
}

/**
 * Send switch selection buttons to players who need to switch (after a faint).
 */
async function sendSwitchSelectionsToPlayers(
  interaction: ButtonInteraction,
  battle: BattleState,
  userIds: string[],
): Promise<void> {
  const channel = interaction.channel;
  if (!channel) return;

  for (const userId of userIds) {
    const player = getPlayerFromBattle(battle, userId);
    if (!player) continue;

    try {
      const switchComponents = buildSwitchButtons(battle.id, userId, player);
      await channel.send({
        content: `<@${userId}> - Your **${player.pokemon.name}** fainted! Choose your next Pokemon:`,
        components: switchComponents,
      });
    } catch (error) {
      logger.warn(`Failed to send switch selection to ${userId}:`, error);
    }
  }
}

/**
 * Start a turn timeout. If a player doesn't select in time, they auto-forfeit.
 * Works for both move_select and switching phases.
 */
function startTurnTimeout(battle: BattleState): void {
  if (battle.turnTimeoutId) {
    clearTimeout(battle.turnTimeoutId);
  }

  battle.turnTimeoutId = setTimeout(async () => {
    if (battle.phase !== "move_select" && battle.phase !== "switching") return;

    // Determine who timed out
    let forfeitUserId: string | null = null;

    if (battle.phase === "switching") {
      // Whoever hasn't switched yet forfeits
      const pending = Array.from(battle.pendingSwitches);
      if (pending.length > 0) {
        forfeitUserId = pending[0];
        battle.endReason = "timeout";
        battle.winner = forfeitUserId === battle.player1.userId ? battle.player2.userId : battle.player1.userId;
        battle.phase = "ended";
      }
    } else {
      // Move selection timeout
      if (battle.player1.selectedAction === null && battle.player2.selectedAction === null) {
        forfeitUserId = null;
        battle.endReason = "timeout";
        battle.winner = null;
        battle.phase = "ended";
      } else if (battle.player1.selectedAction === null) {
        forfeitUserId = battle.player1.userId;
        battle.endReason = "timeout";
        battle.winner = battle.player2.userId;
        battle.phase = "ended";
      } else {
        forfeitUserId = battle.player2.userId;
        battle.endReason = "timeout";
        battle.winner = battle.player1.userId;
        battle.phase = "ended";
      }
    }

    const messages = forfeitUserId
      ? [`<@${forfeitUserId}> ran out of time! Battle over.`]
      : ["Both trainers ran out of time! Battle cancelled."];

    try {
      if (!activeBattles.has(battle.id)) return;

      const rewards = { winnerXp: 0, loserXp: 0, winnerCurrency: 0, loserCurrency: 0, rewardsHalved: false };

      if (battle.winner) {
        const winnerPokemon = battle.winner === battle.player1.userId ? battle.player1.pokemon : battle.player2.pokemon;
        const loserPokemon = battle.winner === battle.player1.userId ? battle.player2.pokemon : battle.player1.pokemon;
        const halved = await shouldHalveRewards(battle.winner);
        const calcRewards = calculateRewards(winnerPokemon.level, loserPokemon.level, halved);
        Object.assign(rewards, calcRewards);
        await applyRewards(battle, battle.winner, calcRewards);
      }

      await logBattle(battle, battle.winner, rewards);
      // Only set PvP cooldown for actual PvP battles
      if (battle.battleType === "pvp") {
        setBattleCooldown(battle.player1.userId, battle.player2.userId);
      }
      // Record NPC/gym attempt as a loss on timeout
      if (isNpcBattle(battle) && battle.npcTrainer) {
        await recordTrainerAttempt(battle.player1.userId, battle.npcTrainer.id, false);
        if (isGymBattle(battle)) {
          await recordGymAttempt(battle.player1.userId, battle.npcTrainer.id);
        }
      }
      cleanupBattle(battle.id);
    } catch (error) {
      logger.error("Error handling turn timeout:", error);
      cleanupBattle(battle.id);
    }
  }, TURN_TIMEOUT_MS);
}

/**
 * Get a player from a battle by userId.
 */
function getPlayerFromBattle(battle: BattleState, userId: string): BattlePlayer | null {
  if (battle.player1.userId === userId) return battle.player1;
  if (battle.player2.userId === userId) return battle.player2;
  return null;
}

/**
 * Build a team of BattlePokemon from team IDs.
 * Falls back to a single Pokemon (current_monster) if no team is set.
 */
async function buildTeam(teamMonsterIds: number[], fallbackMonsterId: number): Promise<BattlePokemon[]> {
  // If user has a team set, use it; otherwise use their current_monster
  const idsToLoad = teamMonsterIds.length > 0 ? teamMonsterIds : [fallbackMonsterId];

  const team: BattlePokemon[] = [];
  for (const id of idsToLoad) {
    const pokemon = await buildBattlePokemon(id);
    if (pokemon) team.push(pokemon);
  }

  return team;
}

/**
 * Load raw monster data from DB.
 */
async function loadMonsterData(monsterDbId: number): Promise<BattlePokemon | null> {
  return buildBattlePokemon(monsterDbId);
}

/**
 * Build a BattlePokemon from a database monster ID.
 * Fetches DB data, PokeAPI data, calculates stats, and loads moves.
 */
async function buildBattlePokemon(monsterDbId: number): Promise<BattlePokemon | null> {
  try {
    // Load from DB
    const dbMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", monsterDbId)
      .first();

    if (!dbMonster) {
      logger.warn(`Monster ${monsterDbId} not found in database`);
      return null;
    }

    // Load from PokeAPI
    const apiPokemon = await findMonsterByID(dbMonster.monster_id);
    if (!apiPokemon) {
      logger.warn(`Pokemon species ${dbMonster.monster_id} not found in PokeAPI`);
      return null;
    }

    // Calculate stats
    const stats = calculateAllStats(apiPokemon.stats, dbMonster);
    const images = getPokemonImages(apiPokemon, Boolean(dbMonster.shiny));

    // Get types
    const types = apiPokemon.types
      .sort((a: any, b: any) => a.slot - b.slot)
      .map((t: any) => t.type.name);

    // Load moves
    const moves = await loadBattleMoves(dbMonster.id!, dbMonster.monster_id, dbMonster.level);

    // Get display name
    const displayName = dbMonster.nickname || capitalizeFirstLetter(apiPokemon.name);

    return {
      dbId: dbMonster.id!,
      speciesId: dbMonster.monster_id,
      name: displayName,
      level: dbMonster.level,
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
      isShiny: Boolean(dbMonster.shiny),
      statStages: defaultStatStages(),
    };
  } catch (error) {
    logger.error(`Error building battle pokemon for monster ${monsterDbId}:`, error);
    return null;
  }
}
