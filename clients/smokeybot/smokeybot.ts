import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { getLogger } from '../../clients/logger';

const logger = getLogger('SmokeyBot');

async function send_image_message(
  interaction: CommandInteraction,
  image: string,
  color = 0x00bc8c,
  delete_after = false,
  delete_timer = 6000,
) {
  const embed = new EmbedBuilder()
    // .setTitle('<:sumSmash:454911973868699648>')
    .setColor(color)
    // .setDescription()
    .setImage(image);
  await interaction.channel
    .send({ embeds: [embed] })
    .then((tmpMsg) => {
      if (delete_after && delete_timer > 1000) {
        setTimeout(delete_message, delete_timer, interaction, tmpMsg.id);
        setTimeout(delete_message, delete_timer, interaction, interaction.id);
      }
    })
    .catch((err) => {
      logger.error(err);
    });
}

async function delete_message(interaction: CommandInteraction, msg_id: any) {
  interaction.channel.messages
    .fetch(msg_id)
    .then((interaction) => {
      interaction.delete();
    })
    .catch((err) => {
      logger.error(err);
    });
}

export async function checkVase(interaction: CommandInteraction): Promise<void> {
  setTimeout(
    send_image_message,
    250,
    interaction,
    'https://media.discordapp.net/attachments/238772427960614912/698266752542572624/mHXydsWErf.gif',
    0x00bc8c,
    true,
    7000,
  );
}

export async function gtfo(interaction: CommandInteraction): Promise<void> {
  setTimeout(
    send_image_message,
    250,
    interaction,
    'https://cdn.discordapp.com/attachments/238494640758587394/699139113605136404/VsSMgcJwSp.gif',
  );
}

export async function sumSmash(interaction: CommandInteraction): Promise<void> {
  setTimeout(
    send_image_message,
    250,
    interaction,
    'https://i.imgur.com/0Ns0tYf.gif',
  );
}
