import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await e.interaction.reply(
    `To invite SmokeyBot into your Discord, click here: https://discord.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=140660567104`,
  );
}

export const names = ['invite'];
