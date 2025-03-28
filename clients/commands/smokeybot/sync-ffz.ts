import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits } from "discord.js";
import type { runEvent } from "..";
import { GLOBAL_COOLDOWN } from "../../../clients/cache";
import { getCurrentTime } from "../../../utils";
import { sync_ffz_emotes } from "../../emote_queue";

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await e.interaction.deferReply();

  await sync_ffz_emotes(e.interaction);
}

export const names = ["sync-emotes-ffz", "sync-ffz"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("sync-ffz")
  .setDescription(
    "Upload your Twitch channel's FrankerFaceZ Emotes to Discord. This won't replace existing emoji."
  )
  .addStringOption((option) =>
    option.setName("channel").setDescription("Twitch Channel").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions);
