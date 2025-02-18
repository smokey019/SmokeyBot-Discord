import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { runEvent } from "..";
import { getCurrentTime } from "../../../utils";
import { GLOBAL_COOLDOWN, reportCache } from "../../cache";

export async function run(e: runEvent) {
  if (e.interaction.user.id != "90514165138989056") return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await reportCache(e.interaction);
}

export const names = ["cache-report"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("cache-report")
  .setDescription("Cache report. Smokey use only.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
