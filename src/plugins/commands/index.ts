/* eslint-disable @typescript-eslint/no-explicit-any */
import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Client, Collection, Interaction, Message } from 'discord.js';
import { readdir } from 'fs';
import path from 'path';
import { ICache } from '../../clients/cache';
import { IGuildSettings } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { getConfigValue } from '../../config';

const logger = getLogger('Commander');

export interface Command {
  aliases: string[];
  execute(message: any, args?: string[]): any;
}

export interface runEvent {
  message?: Message;
  interaction?: Interaction;
  client: Client;
  args: string[];
  dev: boolean;
  settings: IGuildSettings;
  cache: ICache;
}

export const commands: Collection<string[], (event: runEvent) => any> =
  new Collection();

const slashCommands = [];

/**
 * Load commands dynamically
 */
export async function loadCommands() {
  // Load Pokemon Commands
  readdir(path.join(__dirname, '/pokemon/'), async (err, allFiles) => {
    if (err) console.log(err);
    // const files = allFiles.filter((f) => f.split('.').pop() === 'ts' || 'js');
    const files = allFiles.filter((f) => f.match(/\.ts|\.js/i));
    if (files.length <= 0) console.log('No commands found!');
    else
      for (const file of files) {
        const props = (await import(`./pokemon/${file}`)) as {
          names: string[];
          run: (event: runEvent) => any;
          SlashCommandData?: SlashCommandBuilder;
        };

        logger.debug(
          `Loaded command with alias(es): ${props.names.join(', ')}`,
        );

        commands.set(props.names, props.run);

        if (props.SlashCommandData) {
          slashCommands.push(props.SlashCommandData);
        }
      }
  });

  // Load SmokeyBot Commands
  readdir(path.join(__dirname, '/smokeybot/'), async (err, allFiles) => {
    if (err) console.log(err);
    // const files = allFiles.filter((f) => f.split('.').pop() === 'ts' || 'js');
    const files = allFiles.filter((f) => f.match(/\.ts|\.js/i));
    if (files.length <= 0) console.log('No commands found!');
    else
      for (const file of files) {
        const props = (await import(`./smokeybot/${file}`)) as {
          names: string[];
          run: (event: runEvent) => any;
          SlashCommandData?: SlashCommandBuilder;
        };

        logger.debug(
          `Loaded command with alias(es): ${props.names.join(', ')}`,
        );

        commands.set(props.names, props.run);

        if (props.SlashCommandData) {
          slashCommands.push(props.SlashCommandData);
        }
      }
  });
}

export async function registerSlashCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    const rest = new REST({ version: '9' }).setToken(
      getConfigValue('DISCORD_TOKEN'),
    );

    await rest.put(
      Routes.applicationGuildCommands(
        '758820204133613598',
        '690857004171919370',
      ),
      { body: slashCommands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}
