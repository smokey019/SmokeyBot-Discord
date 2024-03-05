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

  await checkMonstersNew(e.interaction, 1);
}

export const names = ["favorites", "favourites", "favs"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("favorites")
  .setDescription("Show your favorite Pokémon.")
  .addStringOption((option) =>
    option
      .setName("options")
      .setDescription("Choose an option to sort your Pokémon by.")
      .addChoices(
        { name: "IV, Latest Caught First", value: "iv_latest" },
        { name: "IV, Oldest Caught First", value: "iv_oldest" },
        { name: "Level, Latest Caught First", value: "level_latest" },
        { name: "Level, Oldest Caught First", value: "level_oldest" },
        { name: "smokeMon ID, Latest Caught First", value: "id_latest" },
        { name: "smokeMon ID, Oldest Caught First", value: "id_oldest" },
        { name: "Name, Latest Caught First", value: "name_latest" },
        { name: "Name, Oldest Caught First", value: "name_oldest" }
      )
  );
