import { SlashCommandBuilder } from "@discordjs/builders";
import { TextChannel } from "discord.js";
import type { runEvent } from "..";
import { handleTeamCommand } from "../../pokemon/battle/team-manager";
import { isSpawnChannel } from "../../pokemon/utils";

export async function run(e: runEvent) {
  const channel = e.interaction.channel as TextChannel;
  if (
    !e.cache.settings.smokemon_enabled ||
    !isSpawnChannel(channel.id, channel.name, e.cache.settings.specific_channel)
  )
    return;

  await e.interaction.deferReply();
  await handleTeamCommand(e.interaction);
}

export const names = ["team"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("team")
  .setDescription("Manage your battle team")
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View your current battle team")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("View another trainer's team")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a Pokemon to your battle team")
      .addStringOption((option) =>
        option
          .setName("pokemon")
          .setDescription("Pokemon ID to add to your team")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("slot")
          .setDescription("Team slot (1-6). Omit to add to next open slot.")
          .setMinValue(1)
          .setMaxValue(6)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a Pokemon from your battle team")
      .addIntegerOption((option) =>
        option
          .setName("slot")
          .setDescription("Team slot to clear (1-6)")
          .setMinValue(1)
          .setMaxValue(6)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("clear")
      .setDescription("Clear your entire battle team"),
  );
