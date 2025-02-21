import {
	EmbedBuilder,
	MessagePayload,
	TextChannel,
	type CommandInteraction,
	type InteractionEditReplyOptions,
} from "discord.js";
import { getLogger } from "../logger";

const logger = getLogger("Message Queue");

/**
 * Send a message
 * @param interaction
 * @param message
 * @param edit
 */
export async function queueMessage(
  message: string | MessagePayload | InteractionEditReplyOptions,
  interaction: CommandInteraction,
  edit: boolean
): Promise<void> {
  if (edit) {
    await interaction.editReply(message);
  }
  {
    await interaction.reply(message);
  }
}

/**
 * pokémon-spawns channel message w/ embed
 * @param embed
 * @param interaction
 */
export async function spawnChannelMessage(
  embed: EmbedBuilder,
  interaction: CommandInteraction
): Promise<void> {
  const monsterChannel = interaction.guild?.channels.cache.find(
    (ch) => ch.name === "pokémon-spawns"
  );

  (monsterChannel as TextChannel).send({ embeds: [embed] });
}
