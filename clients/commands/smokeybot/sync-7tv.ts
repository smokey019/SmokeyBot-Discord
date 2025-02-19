import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionFlagsBits } from "discord.js";
import type { runEvent } from "..";
import { GLOBAL_COOLDOWN } from "../../../clients/cache";
import { getCurrentTime } from "../../../utils";
import { sync_7tv_emotes } from "../../emote_queue";

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await e.interaction.deferReply();
  await sync_7tv_emotes(e.interaction);
}

export const names = ["sync-emotes-7tv", "sync-7tv"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("sync-7tv")
  .setDescription(
    "Upload your Twitch channel's 7TV Emotes to Discord. This won't replace existing emoji."
  )
  .addStringOption((option) =>
    option
      .setName("channel")
      .setDescription(
        "Twitch Channel Username (you don't have to use ID anymore)"
      )
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions);
