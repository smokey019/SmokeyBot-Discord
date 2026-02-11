import { SlashCommandBuilder } from "@discordjs/builders";
import { TextChannel } from "discord.js";
import type { runEvent } from "..";
import { startBattleChallenge } from "../../pokemon/battle/battle-handler";
import { startWildBattle } from "../../pokemon/battle/battle-handler";
import { isSpawnChannel } from "../../pokemon/utils";

export async function run(e: runEvent) {
  const channel = e.interaction.channel as TextChannel;
  if (
    !e.cache.settings.smokemon_enabled ||
    !isSpawnChannel(channel.id, channel.name, e.cache.settings.specific_channel)
  )
    return;

  await e.interaction.deferReply();

  const subcommand = e.interaction.options.getSubcommand();

  if (subcommand === "wild") {
    await startWildBattle(e.interaction);
  } else {
    await startBattleChallenge(e.interaction);
  }
}

export const names = ["battle", "fight", "pvp"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("battle")
  .setDescription("Pokemon battle system!")
  .addSubcommand((sub) =>
    sub
      .setName("pvp")
      .setDescription("Challenge another trainer to a Pokemon battle!")
      .addUserOption((option) =>
        option
          .setName("opponent")
          .setDescription("The trainer you want to battle")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("wild")
      .setDescription("Battle a random wild Pokemon! Catch it if you can."),
  );
