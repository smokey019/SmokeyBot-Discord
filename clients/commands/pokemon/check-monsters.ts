import { SlashCommandBuilder } from "@discordjs/builders";
import { TextChannel } from "discord.js";
import type { runEvent } from "..";
import { GLOBAL_COOLDOWN } from "../../../clients/cache";
import { getCurrentTime } from "../../../utils";
import { checkMonstersNew } from "../../pokemon/check-monsters";

export async function run(e: runEvent) {
  const channel_name = (e.interaction.channel as TextChannel).name;
  if (
    !e.cache.settings.smokemon_enabled ||
    channel_name != e.cache.settings.specific_channel
  )
    return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await checkMonstersNew(e.interaction);
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
