/**
 * Team management: CRUD operations for battle teams (up to 6 Pokemon per user).
 */

import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { databaseClient } from "../../database";
import { getLogger } from "../../logger";
import { queueMessage } from "../../message_queue";
import { MonsterTable, type IMonsterModel } from "../../../models/Monster";
import { BattleTeamTable, type IBattleTeamModel } from "../../../models/BattleTeam";
import { findMonsterByID } from "../monsters";
import { capitalizeFirstLetter } from "../utils";
import { getPokemonTypeColor } from "../monsters";

const logger = getLogger("TeamManager");

const MAX_TEAM_SIZE = 6;

/**
 * Route /team subcommands.
 */
export async function handleTeamCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "view":
      await viewTeam(interaction);
      break;
    case "add":
      await addToTeam(interaction);
      break;
    case "remove":
      await removeFromTeam(interaction);
      break;
    case "clear":
      await clearTeam(interaction);
      break;
    default:
      await queueMessage("Unknown subcommand.", interaction, true);
  }
}

/**
 * View a user's battle team.
 */
async function viewTeam(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const userId = targetUser.id;

  try {
    const teamSlots = await getUserTeam(userId);

    if (teamSlots.length === 0) {
      await queueMessage(
        targetUser.id === interaction.user.id
          ? "You don't have a battle team set up yet! Use `/team add` to add Pokemon."
          : `<@${userId}> doesn't have a battle team set up yet.`,
        interaction,
        true,
      );
      return;
    }

    // Load Pokemon data for each slot
    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.username}'s Battle Team`)
      .setColor(0xff6600)
      .setTimestamp();

    let primaryType = "normal";

    for (let slot = 1; slot <= MAX_TEAM_SIZE; slot++) {
      const teamEntry = teamSlots.find((t) => t.slot === slot);

      if (teamEntry) {
        const monster = await databaseClient<IMonsterModel>(MonsterTable)
          .select()
          .where("id", teamEntry.monster_db_id)
          .first();

        if (monster) {
          const apiPokemon = await findMonsterByID(monster.monster_id);
          const name = monster.nickname || (apiPokemon ? capitalizeFirstLetter(apiPokemon.name) : `Pokemon #${monster.monster_id}`);
          const shiny = monster.shiny ? " \u2b50" : "";
          const types = apiPokemon?.types
            ?.sort((a: any, b: any) => a.slot - b.slot)
            .map((t: any) => capitalizeFirstLetter(t.type.name))
            .join(" / ") || "???";

          if (slot === 1 && apiPokemon?.types?.[0]) {
            primaryType = apiPokemon.types[0].type.name;
          }

          embed.addFields({
            name: `Slot ${slot}`,
            value: `**${name}**${shiny} (Lv. ${monster.level})\n${types} | ID: ${monster.id}`,
            inline: true,
          });
        } else {
          embed.addFields({
            name: `Slot ${slot}`,
            value: "*Pokemon not found*",
            inline: true,
          });
        }
      } else {
        embed.addFields({
          name: `Slot ${slot}`,
          value: "*Empty*",
          inline: true,
        });
      }
    }

    embed.setColor(getPokemonTypeColor(primaryType));
    embed.setFooter({ text: `${teamSlots.length}/${MAX_TEAM_SIZE} slots filled` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Error viewing team for ${userId}:`, error);
    await queueMessage("An error occurred while loading the team.", interaction, true);
  }
}

/**
 * Add a Pokemon to the user's battle team.
 */
async function addToTeam(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const pokemonIdStr = interaction.options.getString("pokemon", true);
  const requestedSlot = interaction.options.getInteger("slot");

  const pokemonDbId = parseInt(pokemonIdStr);
  if (isNaN(pokemonDbId)) {
    await queueMessage("Please provide a valid Pokemon ID number.", interaction, true);
    return;
  }

  try {
    // Verify the user owns this Pokemon
    const monster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where({ id: pokemonDbId, uid: userId })
      .whereNot("released", 1)
      .first();

    if (!monster) {
      await queueMessage("You don't own that Pokemon, or it has been released.", interaction, true);
      return;
    }

    // Check if this Pokemon is already on the team
    const existing = await databaseClient<IBattleTeamModel>(BattleTeamTable)
      .select()
      .where({ uid: userId, monster_db_id: pokemonDbId })
      .first();

    if (existing) {
      await queueMessage(`That Pokemon is already on your team in slot ${existing.slot}!`, interaction, true);
      return;
    }

    // Get current team
    const currentTeam = await getUserTeam(userId);

    if (currentTeam.length >= MAX_TEAM_SIZE && !requestedSlot) {
      await queueMessage("Your team is full! Remove a Pokemon first or specify a slot to replace.", interaction, true);
      return;
    }

    let targetSlot: number;
    if (requestedSlot) {
      targetSlot = requestedSlot;
      // Remove existing Pokemon in that slot
      await databaseClient<IBattleTeamModel>(BattleTeamTable)
        .where({ uid: userId, slot: targetSlot })
        .delete();
    } else {
      // Find next open slot
      const usedSlots = new Set(currentTeam.map((t) => t.slot));
      targetSlot = 1;
      while (usedSlots.has(targetSlot) && targetSlot <= MAX_TEAM_SIZE) {
        targetSlot++;
      }
      if (targetSlot > MAX_TEAM_SIZE) {
        await queueMessage("Your team is full!", interaction, true);
        return;
      }
    }

    // Insert
    await databaseClient<IBattleTeamModel>(BattleTeamTable).insert({
      uid: userId,
      slot: targetSlot,
      monster_db_id: pokemonDbId,
    });

    const apiPokemon = await findMonsterByID(monster.monster_id);
    const name = monster.nickname || (apiPokemon ? capitalizeFirstLetter(apiPokemon.name) : `Pokemon #${monster.monster_id}`);
    const shiny = monster.shiny ? " \u2b50" : "";

    await queueMessage(
      `**${name}**${shiny} (Lv. ${monster.level}) added to team slot ${targetSlot}!`,
      interaction,
      true,
    );
  } catch (error) {
    logger.error(`Error adding to team for ${userId}:`, error);
    await queueMessage("An error occurred while updating your team.", interaction, true);
  }
}

/**
 * Remove a Pokemon from a team slot.
 */
async function removeFromTeam(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const slot = interaction.options.getInteger("slot", true);

  try {
    const deleted = await databaseClient<IBattleTeamModel>(BattleTeamTable)
      .where({ uid: userId, slot })
      .delete();

    if (deleted > 0) {
      await queueMessage(`Removed Pokemon from team slot ${slot}.`, interaction, true);
    } else {
      await queueMessage(`Slot ${slot} is already empty.`, interaction, true);
    }
  } catch (error) {
    logger.error(`Error removing from team for ${userId}:`, error);
    await queueMessage("An error occurred while updating your team.", interaction, true);
  }
}

/**
 * Clear entire team.
 */
async function clearTeam(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const deleted = await databaseClient<IBattleTeamModel>(BattleTeamTable)
      .where({ uid: userId })
      .delete();

    await queueMessage(
      deleted > 0
        ? `Cleared your battle team (${deleted} Pokemon removed).`
        : "Your team was already empty.",
      interaction,
      true,
    );
  } catch (error) {
    logger.error(`Error clearing team for ${userId}:`, error);
    await queueMessage("An error occurred while clearing your team.", interaction, true);
  }
}

/**
 * Get a user's full team from the database.
 */
export async function getUserTeam(userId: string): Promise<IBattleTeamModel[]> {
  try {
    return await databaseClient<IBattleTeamModel>(BattleTeamTable)
      .select()
      .where("uid", userId)
      .orderBy("slot", "asc");
  } catch (error) {
    logger.error(`Error fetching team for ${userId}:`, error);
    return [];
  }
}

/**
 * Get the monster DB IDs for a user's team, in slot order.
 * Returns empty array if no team is set up.
 */
export async function getUserTeamMonsterIds(userId: string): Promise<number[]> {
  const team = await getUserTeam(userId);
  return team.map((t) => t.monster_db_id);
}
