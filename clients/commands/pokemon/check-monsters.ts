import { SlashCommandBuilder } from "@discordjs/builders";
import { TextChannel, MessageFlags } from "discord.js";
import type { runEvent } from "..";
import { GLOBAL_COOLDOWN } from "../../../clients/cache";
import { getCurrentTime } from "../../../utils";
import { getLogger } from "../../logger";
import { checkMonstersNew } from "../../pokemon/check-monsters";
const logger = getLogger("Commands");

export async function run(e: runEvent) {
  try {
    // channel validation with type safety
    const channel = e.interaction.channel as TextChannel;
    if (!channel) {
      logger.warn("Command used in invalid channel context");
      return;
    }

    const channelName = channel.name;
    const guildId = e.interaction.guild?.id;
    const userId = e.interaction.user?.id;

    // settings validation
    if (!e.cache?.settings) {
      logger.warn(`No settings found for guild ${guildId}`);
      return;
    }

    // Check if Pokemon module is enabled
    if (!e.cache.settings.smokemon_enabled) {
      logger.debug(`Pokemon module disabled in guild ${guildId}`);
      return;
    }

    // channel restriction check with better logging
    if (
      e.cache.settings.specific_channel &&
      channelName !== e.cache.settings.specific_channel
    ) {
      logger.debug(
        `Command used in wrong channel: ${channelName}, expected: ${e.cache.settings.specific_channel}`
      );
      return;
    }

    // Validate required data before proceeding
    if (!guildId) {
      logger.error("No guild ID available for cooldown setting");
      try {
        await e.interaction.editReply(
          "Error: Unable to determine server context. Please try again."
        );
      } catch (replyError) {
        logger.error("Failed to send guild error response:", replyError);
      }
      return;
    }

    // Set cooldown with error handling
    try {
      GLOBAL_COOLDOWN.set(guildId, getCurrentTime());
    } catch (cooldownError) {
      logger.warn("Failed to set global cooldown:", cooldownError);
      // Continue execution as cooldown failure shouldn't break the command
    }

    // interaction response with fallback
    try {
      await e.interaction.editReply("Fetching your Pokémon collection...");
    } catch (editError) {
      logger.warn("Failed to edit reply, attempting regular reply:", editError);
      try {
        // Fallback to regular reply if edit fails
        await e.interaction.reply("Fetching your Pokémon collection...");
      } catch (replyError) {
        logger.error("Failed to send any response:", replyError);
        // Continue execution even if response fails
      }
    }

    // checkMonstersNew call with comprehensive error handling
    try {
      await checkMonstersNew(e.interaction);
      logger.debug(
        `Successfully fetched monsters for user ${userId} in guild ${guildId}`
      );
    } catch (checkError) {
      logger.error(`Error fetching monsters for user ${userId}:`, checkError);

      // Attempt to notify user of the error
      try {
        const errorMessage =
          "An error occurred while fetching your Pokémon. Please try again in a moment.";

        // Try to edit the existing "Fetching..." message
        try {
          await e.interaction.editReply(errorMessage);
        } catch (editError) {
          // If edit fails, try followUp
          try {
            await e.interaction.followUp({
              content: errorMessage,
              flags: MessageFlags.Ephemeral,
            });
          } catch (followUpError) {
            logger.error(
              "Failed to send error notification via followUp:",
              followUpError
            );
          }
        }
      } catch (notificationError) {
        logger.error("Failed to notify user of error:", notificationError);
      }
    }
  } catch (criticalError) {
    logger.error("Critical error in run function:", criticalError);

    // Last resort error handling
    try {
      const criticalMessage =
        "A critical error occurred. Please contact an administrator if this persists.";

      // Try multiple ways to notify the user
      if (e.interaction.replied || e.interaction.deferred) {
        try {
          await e.interaction.editReply(criticalMessage);
        } catch (editError) {
          try {
            await e.interaction.followUp({
              content: criticalMessage,
              flags: MessageFlags.Ephemeral,
            });
          } catch (followUpError) {
            logger.error(
              "All error notification methods failed:",
              followUpError
            );
          }
        }
      } else {
        try {
          await e.interaction.reply({
            content: criticalMessage,
            flags: MessageFlags.Ephemeral,
          });
        } catch (replyError) {
          logger.error("Final error notification failed:", replyError);
        }
      }
    } catch (finalError) {
      logger.error("Final error handling failed:", finalError);
    }
  }
}

export const names = ["pokemon", "p"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("pokemon")
  .setDescription("Show your Pokémon.")
  .addStringOption((option) =>
    option
      .setName("options")
      .setDescription("Choose an option to sort your Pokémon by.")
      .addChoices(
        { name: "IV High", value: "iv_high" },
        { name: "IV Low", value: "iv_low" },
        { name: "Level High", value: "level_high" },
        { name: "Level Low", value: "level_low" },
        { name: "smokeMon ID High", value: "id_high" },
        { name: "smokeMon ID Low", value: "id_low" },
        { name: "Name Ascending", value: "name_high" },
        { name: "Name Descending", value: "name_low" }
      )
  );
