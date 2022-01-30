import { Permissions, PermissionString } from 'discord.js';
import { runEvent } from '..';
import { GLOBAL_COOLDOWN } from '../../../clients/cache';
import { getCurrentTime } from '../../../utils';
import { set_prefix } from '../../pokemon/parser';

export async function run(e: runEvent) {
  const userPerms = new Permissions(e.interaction.member.permissions as PermissionString);

  if (!userPerms.has(Permissions.FLAGS.ADMINISTRATOR)) return;

  GLOBAL_COOLDOWN.set(e.interaction.guild.id, getCurrentTime());

  await set_prefix(e.interaction);
}

export const names = ['prefix'];
