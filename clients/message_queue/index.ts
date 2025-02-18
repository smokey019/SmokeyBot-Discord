import { MessagePayload, type CommandInteraction, type InteractionEditReplyOptions } from "discord.js";
import { getLogger } from "../logger";

const logger = getLogger("Message Queue");

/**
 * Send a message
 * @param interaction
 * @param message
 * @param edit
 */
export async function queueMessage(message: string | MessagePayload | InteractionEditReplyOptions, interaction: CommandInteraction, edit: boolean): Promise<void>{

	if (edit){
		await interaction.editReply(message);
	}{
		await interaction.reply(message);
	}

}