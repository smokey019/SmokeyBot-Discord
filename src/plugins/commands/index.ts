/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client, Collection, Message } from 'discord.js';
import { readdir } from 'fs';
import { ICache } from '../../clients/cache';
import { IGuildSettings } from '../../clients/database';
import { getLogger } from '../../clients/logger';

const logger = getLogger('Commander');

export interface Command {
  aliases: string[];
  execute(message: any, args?: string[]): any;
}

export interface runEvent {
  message: Message;
  client: Client;
  args: string[];
  dev: boolean;
  settings: IGuildSettings;
  cache: ICache;
}

export const commands: Collection<string[], (event: runEvent) => any> =
  new Collection();

/**
 * Load commands dynamically
 */
export async function loadCommands() {
  // Load Pokemon Commands
  readdir('./src/plugins/commands/pokemon/', async (err, allFiles) => {
    if (err) console.log(err);
    const files = allFiles.filter((f) => f.split('.').pop() === 'ts');
    if (files.length <= 0) console.log('No commands found!');
    else
      for (const file of files) {
        const props = (await import(`./pokemon/${file}`)) as {
          names: string[];
          run: (event: runEvent) => any;
        };
        logger.debug(
          `Loaded command with alias(es): ${props.names.join(', ')}`,
        );
        commands.set(props.names, props.run);
      }
  });

  // Load SmokeyBot Commands
  readdir('./src/plugins/commands/smokeybot/', async (err, allFiles) => {
    if (err) console.log(err);
    const files = allFiles.filter((f) => f.split('.').pop() === 'ts');
    if (files.length <= 0) console.log('No commands found!');
    else
      for (const file of files) {
        const props = (await import(`./smokeybot/${file}`)) as {
          names: string[];
          run: (event: runEvent) => any;
        };
        logger.debug(
          `Loaded command with alias(es): ${props.names.join(', ')}`,
        );
        commands.set(props.names, props.run);
      }
  });
}
