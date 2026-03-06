/**
 * Battle UI: embeds, HP bars, and Discord button builders.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  type InteractionReplyOptions,
  type InteractionEditReplyOptions,
} from "discord.js";
import { getLogger } from "../../logger";
import { getPokemonTypeColor } from "../monsters";
import { capitalizeFirstLetter } from "../utils";
import type { BattleState, BattleMove, BattlePokemon, BattlePlayer } from "./battle-state";
import { hasAliveSwitch, getAliveSwitchIndices } from "./battle-state";

const logger = getLogger("BattleUI");

const HP_BAR_LENGTH = 10;

/**
 * Render an HP bar using Unicode block characters.
 */
export function renderHPBar(current: number, max: number): string {
  const ratio = Math.max(0, current) / max;
  const filled = Math.round(ratio * HP_BAR_LENGTH);
  const empty = HP_BAR_LENGTH - filled;

  let colorBlock: string;
  if (ratio > 0.5) colorBlock = "\u2588"; // Full block (green zone)
  else if (ratio > 0.25) colorBlock = "\u2593"; // Dark shade (yellow zone)
  else colorBlock = "\u2591"; // Light shade (red zone)

  const bar = colorBlock.repeat(filled) + "\u2591".repeat(empty);
  return `\`${bar}\` **${Math.max(0, current)}**/${max} HP`;
}

/**
 * Format types for display.
 */
function formatTypes(types: string[]): string {
  return types.map((t) => capitalizeFirstLetter(t)).join(" / ");
}

/**
 * Render a compact team status line showing all Pokemon and their HP status.
 * e.g. "Pikachu [===] | Charizard [==-] | Blastoise [XXX]"
 */
function renderTeamStatus(player: BattlePlayer): string {
  return player.team
    .map((p, i) => {
      const active = i === player.activePokemonIndex ? "\u25b6 " : ""; // Arrow for active
      const fainted = p.currentHp <= 0;
      if (fainted) {
        return `${active}~~${p.name}~~ \u2620\ufe0f`;
      }
      const ratio = p.currentHp / p.maxHp;
      const status = ratio > 0.5 ? "\ud83d\udfe2" : ratio > 0.25 ? "\ud83d\udfe1" : "\ud83d\udd34";
      return `${active}${p.name} ${status}`;
    })
    .join(" | ");
}

/**
 * Build the main battle embed that both players and spectators see.
 */
export function buildBattleEmbed(battle: BattleState, turnMessages?: string[]): EmbedBuilder {
  const p1 = battle.player1.pokemon;
  const p2 = battle.player2.pokemon;
  const isTeamBattle = battle.player1.team.length > 1 || battle.player2.team.length > 1;

  const embed = new EmbedBuilder()
    .setTitle(`Battle: <@${battle.player1.userId}> vs <@${battle.player2.userId}>`)
    .setColor(getPokemonTypeColor(p1.types[0] || "normal"))
    .addFields(
      {
        name: `${p1.isShiny ? "\u2b50 " : ""}${p1.name} (Lv. ${p1.level})`,
        value: `${formatTypes(p1.types)}\n${renderHPBar(p1.currentHp, p1.maxHp)}`,
        inline: true,
      },
      {
        name: "\u200b",
        value: "\u2694\ufe0f **VS** \u2694\ufe0f",
        inline: true,
      },
      {
        name: `${p2.isShiny ? "\u2b50 " : ""}${p2.name} (Lv. ${p2.level})`,
        value: `${formatTypes(p2.types)}\n${renderHPBar(p2.currentHp, p2.maxHp)}`,
        inline: true,
      },
    );

  // Show team status for team battles
  if (isTeamBattle) {
    embed.addFields(
      {
        name: `<@${battle.player1.userId}>'s Team`,
        value: renderTeamStatus(battle.player1),
        inline: false,
      },
      {
        name: `<@${battle.player2.userId}>'s Team`,
        value: renderTeamStatus(battle.player2),
        inline: false,
      },
    );
  }

  // Turn log
  if (turnMessages && turnMessages.length > 0) {
    const log = turnMessages.join("\n");
    const truncated = log.length > 1024 ? log.substring(0, 1021) + "..." : log;
    embed.addFields({
      name: "Battle Log",
      value: truncated,
      inline: false,
    });
  }

  // Sprites
  if (p1.spriteUrl) embed.setThumbnail(p1.spriteUrl);
  if (p2.spriteUrl) embed.setImage(p2.spriteUrl);

  embed.setFooter({ text: `Turn ${battle.turn}` }).setTimestamp();

  return embed;
}

/**
 * Build the challenge embed with Accept/Decline buttons.
 * For team battles, shows team size info.
 */
export function buildChallengeEmbed(
  challengerId: string,
  targetId: string,
  challengerPokemon: BattlePokemon,
  targetPokemon: BattlePokemon,
  challengerTeamSize?: number,
  targetTeamSize?: number,
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const isTeam = (challengerTeamSize && challengerTeamSize > 1) || (targetTeamSize && targetTeamSize > 1);
  const battleType = isTeam ? `${Math.max(challengerTeamSize || 1, targetTeamSize || 1)}v${Math.max(challengerTeamSize || 1, targetTeamSize || 1)} Team Battle` : "1v1 Battle";

  const embed = new EmbedBuilder()
    .setTitle("Battle Challenge!")
    .setDescription(
      `<@${challengerId}> challenges <@${targetId}> to a **${battleType}**!\n\n` +
        `Lead: **${challengerPokemon.name}** (Lv. ${challengerPokemon.level}) vs **${targetPokemon.name}** (Lv. ${targetPokemon.level})\n` +
        (isTeam
          ? `\nTeam sizes: ${challengerTeamSize || 1} vs ${targetTeamSize || 1} Pokemon\n`
          : "") +
        `\n<@${targetId}>, do you accept?`,
    )
    .setColor(0xff6600)
    .setFooter({ text: "Challenge expires in 60 seconds" })
    .setTimestamp();

  if (challengerPokemon.spriteUrl) embed.setThumbnail(challengerPokemon.spriteUrl);
  if (targetPokemon.spriteUrl) embed.setImage(targetPokemon.spriteUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`battle_accept_${challengerId}_${targetId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`battle_decline_${challengerId}_${targetId}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
  );

  return { embed, components: [row] };
}

/**
 * Build move selection buttons for a player.
 * In team battles, also includes a Switch button if the player has alive reserves.
 */
export function buildMoveButtons(
  battleId: string,
  userId: string,
  pokemon: BattlePokemon,
  player?: BattlePlayer,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Move buttons
  const moveButtons: ButtonBuilder[] = [];
  for (let i = 0; i < pokemon.moves.length; i++) {
    const move = pokemon.moves[i];
    moveButtons.push(
      new ButtonBuilder()
        .setCustomId(`battle_move_${battleId}_${userId}_${i}`)
        .setLabel(`${move.name} (${move.pp}/${move.ppMax})`)
        .setStyle(move.pp > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(move.pp <= 0),
    );
  }

  if (moveButtons.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...moveButtons));
  }

  // Action row: Switch (if team battle with alive reserves) + Forfeit
  const actionButtons: ButtonBuilder[] = [];

  if (player && player.team.length > 1 && hasAliveSwitch(player)) {
    actionButtons.push(
      new ButtonBuilder()
        .setCustomId(`battle_switchmenu_${battleId}_${userId}`)
        .setLabel("Switch Pokemon")
        .setStyle(ButtonStyle.Success),
    );
  }

  actionButtons.push(
    new ButtonBuilder()
      .setCustomId(`battle_forfeit_${battleId}_${userId}`)
      .setLabel("Forfeit")
      .setStyle(ButtonStyle.Danger),
  );

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...actionButtons));

  return rows;
}

/**
 * Build switch selection buttons (shown when a player chooses to switch or is forced to).
 */
export function buildSwitchButtons(
  battleId: string,
  userId: string,
  player: BattlePlayer,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const buttons: ButtonBuilder[] = [];

  const aliveIndices = getAliveSwitchIndices(player);

  for (const idx of aliveIndices) {
    const p = player.team[idx];
    const hpPercent = Math.round((p.currentHp / p.maxHp) * 100);
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`battle_switch_${battleId}_${userId}_${idx}`)
        .setLabel(`${p.name} (Lv.${p.level} | ${hpPercent}% HP)`)
        .setStyle(ButtonStyle.Success),
    );
  }

  // Discord max 5 buttons per row -- split if needed
  while (buttons.length > 0) {
    const chunk = buttons.splice(0, 5);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...chunk));
  }

  return rows;
}

/**
 * Build move buttons for wild battles.
 * Includes move buttons + Catch (if HP low enough) + Run.
 */
export function buildWildMoveButtons(
  battleId: string,
  userId: string,
  pokemon: BattlePokemon,
  wildPokemon: BattlePokemon,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // Move buttons (same as PvP)
  const moveButtons: ButtonBuilder[] = [];
  for (let i = 0; i < pokemon.moves.length; i++) {
    const move = pokemon.moves[i];
    moveButtons.push(
      new ButtonBuilder()
        .setCustomId(`battle_move_${battleId}_${userId}_${i}`)
        .setLabel(`${move.name} (${move.pp}/${move.ppMax})`)
        .setStyle(move.pp > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(move.pp <= 0),
    );
  }

  if (moveButtons.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...moveButtons));
  }

  // Action row: Catch (if HP low enough) + Run
  const actionButtons: ButtonBuilder[] = [];

  const wildHpRatio = wildPokemon.currentHp / wildPokemon.maxHp;
  if (wildHpRatio <= 0.25 && wildPokemon.currentHp > 0) {
    const catchChance = Math.round((0.10 + (1 - wildHpRatio) * 0.75) * 100);
    actionButtons.push(
      new ButtonBuilder()
        .setCustomId(`battle_catch_${battleId}_${userId}`)
        .setLabel(`Throw Pokeball (${catchChance}%)`)
        .setStyle(ButtonStyle.Success),
    );
  }

  actionButtons.push(
    new ButtonBuilder()
      .setCustomId(`battle_run_${battleId}_${userId}`)
      .setLabel("Run")
      .setStyle(ButtonStyle.Danger),
  );

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...actionButtons));

  return rows;
}

/**
 * Build the battle-over embed showing results.
 */
export function buildBattleOverEmbed(
  battle: BattleState,
  winnerId: string | null,
  turnMessages: string[],
  rewards?: { winnerXp: number; loserXp: number; winnerCurrency: number; loserCurrency: number },
): EmbedBuilder {
  const embed = buildBattleEmbed(battle, turnMessages);

  if (winnerId) {
    const loserId = winnerId === battle.player1.userId ? battle.player2.userId : battle.player1.userId;
    embed.setTitle("Battle Over!");
    embed.setDescription(`<@${winnerId}> wins! <@${loserId}> has been defeated!`);
    embed.setColor(0x41c600);
  } else {
    embed.setTitle("Battle Over - Draw!");
    embed.setDescription("Both Pokemon fainted! It's a draw!");
    embed.setColor(0xfcff00);
  }

  if (rewards) {
    const winnerId2 = winnerId || battle.player1.userId;
    const loserId = winnerId2 === battle.player1.userId ? battle.player2.userId : battle.player1.userId;
    embed.addFields({
      name: "Rewards",
      value:
        `<@${winnerId2}>: +${rewards.winnerXp} XP, +${rewards.winnerCurrency} currency\n` +
        `<@${loserId}>: +${rewards.loserXp} XP, +${rewards.loserCurrency} currency`,
      inline: false,
    });
  }

  embed.setFooter({ text: `Battle lasted ${battle.turn - 1} turns | ${battle.endReason || "faint"}` });

  return embed;
}

/**
 * Build waiting message (ephemeral).
 */
export function buildWaitingMessage(pokemonName: string): InteractionReplyOptions {
  return {
    content: `You selected your move! Waiting for your opponent to choose...`,
    flags: MessageFlags.Ephemeral,
  };
}

/**
 * Build the "challenge expired" embed.
 */
export function buildChallengeExpiredEmbed(challengerId: string, targetId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Challenge Expired")
    .setDescription(`<@${targetId}> did not respond to <@${challengerId}>'s battle challenge in time.`)
    .setColor(0x808080)
    .setTimestamp();
}

/**
 * Get a type-related emoji.
 */
function getTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    normal: "\u2b1c",
    fire: "\ud83d\udd25",
    water: "\ud83d\udca7",
    electric: "\u26a1",
    grass: "\ud83c\udf3f",
    ice: "\u2744\ufe0f",
    fighting: "\ud83e\udd4a",
    poison: "\u2620\ufe0f",
    ground: "\ud83c\udfdc\ufe0f",
    flying: "\ud83e\udeb6",
    psychic: "\ud83d\udd2e",
    bug: "\ud83d\udc1b",
    rock: "\ud83e\udea8",
    ghost: "\ud83d\udc7b",
    dragon: "\ud83d\udc09",
    dark: "\ud83c\udf11",
    steel: "\u2699\ufe0f",
    fairy: "\u2728",
  };
  return emojis[type.toLowerCase()] || "\u2753";
}

/**
 * Send move selection buttons to a player as an ephemeral follow-up.
 */
export async function sendMoveSelection(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  battleId: string,
  userId: string,
  pokemon: BattlePokemon,
  player?: BattlePlayer,
): Promise<void> {
  try {
    const components = buildMoveButtons(battleId, userId, pokemon, player);
    await interaction.followUp({
      content: `**${pokemon.name}** - Choose your move:`,
      components,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    logger.error(`Error sending move selection to ${userId}:`, error);
  }
}
