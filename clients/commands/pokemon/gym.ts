import { SlashCommandBuilder } from "@discordjs/builders";
import { TextChannel } from "discord.js";
import type { runEvent } from "..";
import {
  GYMS,
  getGymByOrder,
  getNextGym,
  canChallengeGym,
  getGymCooldown,
  getUserBadges,
  buildGymListEmbed,
  buildBadgeEmbed,
  buildGymLeaderboardEmbed,
} from "../../pokemon/battle/battle-gym";
import { startGymBattle } from "../../pokemon/battle/battle-handler";
import { queueMessage } from "../../message_queue";
import { isSpawnChannel } from "../../pokemon/utils";

export async function run(e: runEvent) {
  const channel = e.interaction.channel as TextChannel;
  if (
    !e.cache.settings.smokemon_enabled ||
    !isSpawnChannel(channel.id, channel.name, e.cache.settings.specific_channel)
  )
    return;

  await e.interaction.deferReply();

  const subcommand = e.interaction.options.getSubcommand();

  if (subcommand === "list") {
    await handleGymList(e);
  } else if (subcommand === "challenge") {
    await handleGymChallenge(e);
  } else if (subcommand === "badges") {
    await handleBadges(e);
  } else if (subcommand === "leaderboard") {
    await handleLeaderboard(e);
  }
}

async function handleGymList(e: runEvent) {
  const userId = e.interaction.user.id;
  const badges = await getUserBadges(userId);
  const embed = buildGymListEmbed(badges);
  await e.interaction.editReply({ embeds: [embed] });
}

async function handleGymChallenge(e: runEvent) {
  const userId = e.interaction.user.id;
  const gymNumber = e.interaction.options.getInteger("number");

  let gym;

  if (gymNumber) {
    // Challenge a specific gym
    gym = getGymByOrder(gymNumber);
    if (!gym) {
      await queueMessage(
        `Invalid gym number! Choose 1-8. Use \`/gym list\` to see available gyms.`,
        e.interaction,
        true,
      );
      return;
    }
  } else {
    // Auto-pick the next available gym
    gym = await getNextGym(userId);
    if (!gym) {
      await queueMessage(
        "You've already defeated all 8 Gym Leaders! You are a Pokemon Champion! Use `/gym challenge <number>` to re-challenge a gym for fun.",
        e.interaction,
        true,
      );
      // Let them re-challenge any gym for fun
      return;
    }
  }

  // Check progression requirement
  const { allowed, reason } = await canChallengeGym(userId, gym);
  if (!allowed) {
    await queueMessage(reason!, e.interaction, true);
    return;
  }

  // Check cooldown (only after a loss)
  const cooldown = await getGymCooldown(userId, gym.id, gym.retryCooldownMinutes);
  if (cooldown > 0) {
    await queueMessage(
      `**${gym.leaderTitle} ${gym.leaderName}** is not ready for a rematch! Come back in **${cooldown} minute${cooldown !== 1 ? "s" : ""}**.`,
      e.interaction,
      true,
    );
    return;
  }

  await startGymBattle(e.interaction, gym);
}

async function handleBadges(e: runEvent) {
  const targetUser = e.interaction.options.getUser("user") || e.interaction.user;
  const badges = await getUserBadges(targetUser.id);
  const embed = buildBadgeEmbed(targetUser.id, targetUser.username, badges);
  await e.interaction.editReply({ embeds: [embed] });
}

async function handleLeaderboard(e: runEvent) {
  const embed = await buildGymLeaderboardEmbed();
  await e.interaction.editReply({ embeds: [embed] });
}

export const names = ["gym", "badge", "badges"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("gym")
  .setDescription("Pokemon Gym challenge system!")
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("View all 8 gyms and your badge progress"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("challenge")
      .setDescription("Challenge a Gym Leader!")
      .addIntegerOption((option) =>
        option
          .setName("number")
          .setDescription("Gym number (1-8). Leave blank for next available gym.")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(8),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("badges")
      .setDescription("View earned gym badges")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("View another player's badges")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("leaderboard")
      .setDescription("View the gym badge leaderboard"),
  );
