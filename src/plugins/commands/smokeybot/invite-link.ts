import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { queueMsg } from '../../../clients/queue';
import { getCurrentTime } from '../../../utils';

export async function run(e: runEvent) {
  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  queueMsg(`To invite SmokeyBot into your Discord, click here: https://discord.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=140660567104`, e.interaction, true);
}

export const names = ['invite'];
