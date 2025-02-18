import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import type { runEvent } from "..";
import { GLOBAL_COOLDOWN } from "../../../clients/cache";
import { explode, getCurrentTime, jsonFetch } from "../../../utils";
import { getLogger } from "../../logger";

const logger = getLogger("7TV Emote Upload");

export async function run(e: runEvent) {
  if (!e.interaction || !e.interaction.guild) return;
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await e.interaction.deferReply();
  await uploadEmote(e.interaction);
}

export const names = ["upload"];

export const SlashCommandData = new SlashCommandBuilder()
  .setName("upload")
  .setDescription(
    "Upload an emote from 7tv with the URL.  This will replace any existing emote."
  )
  .addStringOption((option) =>
    option.setName("url").setDescription("7tv emote URL").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions);

async function uploadEmote(interaction: CommandInteraction): Promise<void> {
  const url = interaction.options.getString("url");

  if (!url.match("https://")) return;

  const emoteCode = explode(url.replace("https://"), "/", 3);

  const emote = await jsonFetch(`https://7tv.io/v3/emotes/${emoteCode[2]}`);

  if (emote.animated) {
    await create_emoji(
      "https:" + emote.host.url + "/2x.gif",
      interaction,
      emote.name.replace(/\W/gm, ""),
      "https:" + emote.host.url + "/1x.gif"
    );
  } else {
    await create_emoji(
      "https:" + emote.host.url + "/2x.png",
      interaction,
      emote.name.replace(/\W/gm, "")
    );
  }
}

/**
 * Function to create an emoji in a Discord server.
 * @param emote_url Emote URL (256kb limit)
 * @param interaction Interaction Object
 * @param name String
 * @returns true/false
 */
async function create_emoji(
  emote_url: string,
  interaction: CommandInteraction,
  name: string,
  smallGIF?: string
): Promise<boolean> {
  if (!interaction.guild) return false;

  logger.trace(
    `Creating new emoji with name ${name} in ${interaction.guild.name}...`
  );

  try {
    if (
      await interaction.guild.emojis
        .create({ attachment: emote_url, name: name })
        .then(async (emoji) => {
          logger.debug(
            `Created new emoji with name ${emoji.name} in ${emoji.guild.name}.`
          );

          interaction.editReply(
            `Successfully uploaded emote \`${emoji.name}\`.`
          );

          return true;
        })
    ) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    if (err.message.match("Failed to resize asset")) {
      logger.debug(`'${name}' is too big, will try to upload 1x.`);
      await interaction.editReply(
        `'${name}' is too big, SmokeyBot will attempt to upload the 1x (smallest) version but if that is also too big it won't resize and will fail to upload.  Note this will also make it lower quality.`
      );
      if (!smallGIF) return false;
      try {
        if (
          await interaction.guild.emojis
            .create({ attachment: smallGIF, name: name })
            .then(async (emoji) => {
              logger.debug(
                `Created new emoji with name ${emoji.name} in ${emoji.guild.name}.`
              );

              interaction.editReply(
                `Successfully uploaded emote \`${emoji.name}\`.`
              );

              return true;
            })
        ) {
          return true;
        } else {
          return false;
        }
      } catch (error) {
        await interaction.editReply(
          `Ok we can't upload \`${name}\`, likely because it's filesize is still too big.`
        );
      }

      return false;
    } else if (err.message.match("Maximum number")) {
      logger.debug(
        `Maximum number of emotes reached in ${interaction.guild.name}.`
      );
      await interaction.editReply(
        `You've reached the maximum amount of emotes for the server.  Make sure you have enough animated AND standard emote slots.  Either one being full will prevent the bot from uploading emotes.`
      );

      return false;
    } else if (err.message.match("Missing Permissions")) {
      logger.debug(`Missing Permissions in ${interaction.guild.name}.`);
      await interaction.editReply(
        `SmokeyBot doesn't have the proper permissions. Make sure SmokeyBot can Manage Emoji in the roles section.`
      );

      return false;
    } else {
      logger.error(err);

      return false;
    }
  }
}
