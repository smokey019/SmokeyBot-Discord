import { Permissions } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { set_prefix } from '../../pokemon/parser';

export async function run(e: runEvent) {
  if (!e.message.member.permissions.has([Permissions.FLAGS.ADMINISTRATOR])) return;
  GLOBAL_COOLDOWN.set(e.message.guild.id, getCurrentTime());

  await set_prefix(e.message);
}

export const names = ['prefix'];
