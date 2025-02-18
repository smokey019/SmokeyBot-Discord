import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits } from "discord.js";
import type { runEvent } from "..";
import { getCurrentTime } from "../../../utils";
import { GLOBAL_COOLDOWN } from "../../cache";
import { RemoveEmote } from "../../emote_queue";
import { getLogger } from "../../logger";

const logger = getLogger("Emote Remover");

export async function run(e: runEvent) {
  if (!e.interaction || !e.interaction.guild) return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await e.interaction.deferReply();
  await RemoveEmote(e.interaction);
}

export const names = ["qremove"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("qremove")
  .setDescription("Remove an emote from your existing emote queue.")
  .addStringOption((option) =>
    option
      .setName("emote")
      .setDescription("Emote name. Case Sensitive.")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions);
