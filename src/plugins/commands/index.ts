/* eslint-disable @typescript-eslint/no-explicit-any */
import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Client, Collection, CommandInteraction, Message } from 'discord.js';
import { readdir } from 'fs';
import path from 'path';
import { ICache } from '../../clients/cache';
import { IGuildSettings } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { getConfigValue } from '../../config';

const logger = getLogger('Commander');

export interface runEvent {
  message?: Message;
  interaction?: CommandInteraction;
  client: Client;
  args: string[];
  dev: boolean;
  settings: IGuildSettings;
  cache: ICache;
}

export const commands: Collection<string[], (event: runEvent) => any> =
  new Collection();

export const slashCommands = [];

/**
 * Load commands dynamically
 */
export async function loadCommands() {
  // Load Pokémon Commands
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
    logger.debug('Started refreshing application (/) commands.');

    const rest = new REST({ version: '9' }).setToken(
      getConfigValue('DISCORD_TOKEN'),
    );

    await rest.put(Routes.applicationCommands('458710213122457600'), {
      body: slashCommands,
    });

    logger.debug('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}
