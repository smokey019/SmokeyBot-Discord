import { SlashCommandBuilder } from "@discordjs/builders";
import { TextChannel } from "discord.js";
import type { runEvent } from "..";
import { GLOBAL_COOLDOWN } from "../../../clients/cache";
import { getCurrentTime } from "../../../utils";
import { checkVote } from "../../top.gg";
import { isSpawnChannel } from "../../pokemon/utils";

export async function run(e: runEvent) {
  const channel = e.interaction.channel as TextChannel;
  if (
    !e.cache.settings.smokemon_enabled ||
    !isSpawnChannel(channel.id, channel.name, e.cache.settings.specific_channel)
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());
  await e.interaction.deferReply();
  await checkVote(e.interaction);
}

export const names = ["vote"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("vote")
  .setDescription(
    "Vote for SmokeyBot on Top.GG and receive rewards for the Pokémon plugin!"
  );
