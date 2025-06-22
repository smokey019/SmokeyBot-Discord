import { SlashCommandBuilder } from "@discordjs/builders";
import type { runEvent } from "..";
import { releaseMonster } from "../../pokemon/release-monster";

export async function run(e: runEvent) {
  e.interaction.reply("working..");

  await releaseMonster(e.interaction);
}

export const names = ["release", "r"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("release")
  .setDescription("Release a Pokémon.")
  .addStringOption((option) =>
    option
      .setName("pokemon")
      .setDescription(
        "Pokémon's smokeMon ID #. Leave blank to release latest catch."
      )
  );
