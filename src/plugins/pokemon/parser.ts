/* eslint-disable @typescript-eslint/no-explicit-any */
import { Message } from 'discord.js';
import { databaseClient, IGuildSettings } from '../../clients/database';
import { parseArgs } from './utils';

export const default_prefixes = ['!', '~', 'p!'];

/**
 * Retrieve Guild Prefixes
 * Default: ['!', '~', 'p!']
 * @param guild_id message.guild.id
 * @returns ['!', '~', 'p!'] or more.
 */
export async function getPrefixes(guild_id: string): Promise<any> {
  const data = await databaseClient('guild_settings')
    .where({
      guild_id: guild_id,
    })
    .select('prefixes')
    .first();

    if (data){
      return JSON.parse(data.prefixes);
    }else{
      return default_prefixes;
    }
}

/**
 * Update a Guild's Prefixes
 * @param guild_id
 * @param prefixes
 * @returns
 */
export async function updatePrefixes(
  guild_id: string,
  prefixes: string[],
): Promise<any> {
  return await databaseClient<IGuildSettings>('guild_settings')
    .where({
      guild_id: guild_id,
    })
    .update({
      prefixes: JSON.stringify(prefixes),
    });
}

export async function set_prefix(message: Message): Promise<void> {
  let i = 0;
  const parse = await parseArgs(message);
  const prefixes = await getPrefixes(message.guild.id);

  if (!parse.args[1] || (!parse.args[2] && parse.args[1] != 'default')) {
    await message.reply(
      'Not enough parameters. Example: `!prefix enable !`. Type `!prefix help` for more information.',
    );
    return;
  }

  if (parse.args[1] == 'enable') {
    switch (parse.args[2]) {
      case '!':
        if (!prefixes.includes('!')) {
          prefixes.push('!');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `!` as a prefix. Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;
      case '?':
        if (!prefixes.includes('\\?')) {
          prefixes.push('\\?');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `?` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;
      case '~':
        if (!prefixes.includes('~')) {
          prefixes.push('~');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `~` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;
      case 'p!':
        if (!prefixes.includes('p!')) {
          prefixes.push('p!');
          await updatePrefixes(message.guild.id, prefixes);
          await message.reply(
            'Successfully added `p!` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
        }

        break;

      default:
        await message.reply(
          'You can enable/disable these prefixes: ' + prefixes,
        );
        break;
    }
  } else if (parse.args[1] == 'disable') {
    switch (parse.args[2]) {
      case '!':
        if (prefixes.includes('!') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === '!') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `!` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;
      case '?':
        if (prefixes.includes('\\?') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === '\\?') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `?` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;
      case '~':
        if (prefixes.includes('~') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === '~') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `~` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;
      case 'p!':
        if (prefixes.includes('p!') && prefixes.length > 1) {
          for (i = 0; i < prefixes.length; i++) {
            if (prefixes[i] === 'p!') {
              prefixes.splice(i, 1);
            }
          }
          await message.reply(
            'Successfully removed `p!` as a prefix.  Your prefixes are now: `' +
              prefixes.join(' ') +
              '`.',
          );
          await updatePrefixes(message.guild.id, prefixes);
        }

        break;

      default:
        await message.reply(
          'You can enable/disable these prefixes: ' + prefixes,
        );
        break;
    }
  } else if (parse.args[1] == 'default') {
    await updatePrefixes(message.guild.id, default_prefixes);
    await message.reply(
      'Successfully reset prefixes back to default: ' +
        default_prefixes.join(', '),
    );
  } else if (parse.args[1] == 'help') {
    await message.reply(
      'Enable/disable prefixes: `!prefix disable ~` or `!prefix enable p!`. By default SmokeyBot uses: `' +
        default_prefixes.join(' ') +
        '`.',
    );
  }
}

export async function prefix_check(message: Message): Promise<boolean> {
  const prefixes = await getPrefixes(message.guild.id);

  if (prefixes.includes(message.content.charAt(0))) {
    return true;
  } else {
    return false;
  }
}
