import { SlashCommandBuilder } from "@discordjs/builders";
import { TextChannel, MessageFlags } from "discord.js";
import type { runEvent } from "..";
import {
  NPC_TRAINERS,
  getTrainerById,
  getTrainersByDifficulty,
  getAllTrainerProgress,
  getTrainerCooldown,
  buildTrainerListEmbed,
  type NpcDifficulty,
} from "../../pokemon/battle/battle-npc";
import { startNpcBattle } from "../../pokemon/battle/battle-handler";
import { queueMessage } from "../../message_queue";
import { isSpawnChannel } from "../../pokemon/utils";

const VALID_DIFFICULTIES: NpcDifficulty[] = ["easy", "medium", "hard", "elite"];

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
    await handleTrainerList(e);
  } else if (subcommand === "battle") {
    await handleTrainerBattle(e);
  }
}

async function handleTrainerList(e: runEvent) {
  const difficultyOption = e.interaction.options.getString("difficulty");
  const userId = e.interaction.user.id;

  // Get user progress for all trainers
  const userProgress = await getAllTrainerProgress(userId);

  if (difficultyOption) {
    const difficulty = difficultyOption as NpcDifficulty;
    const trainers = getTrainersByDifficulty(difficulty);
    const embed = buildTrainerListEmbed(difficulty, trainers, userProgress);
    await e.interaction.editReply({ embeds: [embed] });
  } else {
    // Show all tiers
    const embeds = VALID_DIFFICULTIES.map((diff) => {
      const trainers = getTrainersByDifficulty(diff);
      return buildTrainerListEmbed(diff, trainers, userProgress);
    });
    await e.interaction.editReply({ embeds });
  }
}

async function handleTrainerBattle(e: runEvent) {
  const trainerName = e.interaction.options.getString("trainer", true).toLowerCase();

  // Find trainer by ID or partial name match
  let trainer = getTrainerById(trainerName);
  if (!trainer) {
    trainer = NPC_TRAINERS.find(
      (t) =>
        t.id.toLowerCase() === trainerName ||
        t.name.toLowerCase() === trainerName ||
        `${t.title} ${t.name}`.toLowerCase() === trainerName ||
        `${t.title.toLowerCase()}_${t.name.toLowerCase()}` === trainerName,
    );
  }

  if (!trainer) {
    await queueMessage(
      `Trainer not found! Use \`/trainer list\` to see available trainers. You can use the trainer's name (e.g. "joey") or full ID (e.g. "youngster_joey").`,
      e.interaction,
      true,
    );
    return;
  }

  // Check cooldown
  const cooldownRemaining = await getTrainerCooldown(
    e.interaction.user.id,
    trainer.id,
    trainer.cooldownMinutes,
  );

  if (cooldownRemaining > 0) {
    await queueMessage(
      `**${trainer.title} ${trainer.name}** is not ready for a rematch! Come back in **${cooldownRemaining} minute${cooldownRemaining !== 1 ? "s" : ""}**.`,
      e.interaction,
      true,
    );
    return;
  }

  await startNpcBattle(e.interaction, trainer);
}

export const names = ["trainer", "npc"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("trainer")
  .setDescription("Battle NPC trainers!")
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("View available NPC trainers")
      .addStringOption((option) =>
        option
          .setName("difficulty")
          .setDescription("Filter by difficulty tier")
          .setRequired(false)
          .addChoices(
            { name: "Easy", value: "easy" },
            { name: "Medium", value: "medium" },
            { name: "Hard", value: "hard" },
            { name: "Elite", value: "elite" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("battle")
      .setDescription("Challenge an NPC trainer!")
      .addStringOption((option) =>
        option
          .setName("trainer")
          .setDescription("Trainer name or ID (e.g. \"joey\" or \"youngster_joey\")")
          .setRequired(true),
      ),
  );
