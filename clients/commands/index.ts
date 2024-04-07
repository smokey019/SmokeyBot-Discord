/* eslint-disable @typescript-eslint/no-explicit-any */
import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { Client, Collection, CommandInteraction, Message } from "discord.js";
import { readdir } from "fs";
import path from "path";
import type { IGuildSettings } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import type { ICache } from "../cache";

const logger = getLogger("Commander");

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
  readdir(path.join(__dirname, "/pokemon/"), async (err, allFiles) => {
    if (err) console.log(err);
    // const files = allFiles.filter((f) => f.split('.').pop() === 'ts' || 'js');
    const files = allFiles.filter((f) => f.match(/\.ts|\.js/i));
    if (files.length <= 0) console.log("No commands found!");
    else
      for (const file of files) {
        const props = (await import(`./pokemon/${file}`)) as {
          names: string[];
          run: (event: runEvent) => any;
          SlashCommandData?: SlashCommandBuilder;
        };

        logger.trace(
          `Loaded command with alias(es): ${props.names.join(", ")}`
        );

        commands.set(props.names, props.run);

        if (props.SlashCommandData) {
          slashCommands.push(props.SlashCommandData);
        }
      }
  });

  // Load SmokeyBot Commands
  readdir(path.join(__dirname, "/smokeybot/"), async (err, allFiles) => {
    if (err) console.log(err);
    // const files = allFiles.filter((f) => f.split('.').pop() === 'ts' || 'js');
    const files = allFiles.filter((f) => f.match(/\.ts|\.js/i));
    if (files.length <= 0) console.log("No commands found!");
    else
      for (const file of files) {
        const props = (await import(`./smokeybot/${file}`)) as {
          names: string[];
          run: (event: runEvent) => any;
          SlashCommandData?: SlashCommandBuilder;
        };

        logger.trace(
          `Loaded command with alias(es): ${props.names.join(", ")}`
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
    logger.debug("Attempting to refresh slash commands.");

    let token = undefined;
    let api = undefined;

    if (process.env.DEV == "true") {

      // registers only for the test server

      token = process.env.DISCORD_TOKEN_DEV;
      api = process.env.API_CLIENT_ID_DEV;

      const rest = new REST().setToken(token);

      await rest.put(Routes.applicationCommands(api), {
        body: slashCommands,
      });

      await rest.put(
        Routes.applicationGuildCommands(api, "690857004171919370"),
        { body: slashCommands }
      );
    } else {

      // registers for all of discord

      token = process.env.DISCORD_TOKEN;
      api = process.env.API_CLIENT_ID;

      const rest = new REST().setToken(token);

      await rest.put(Routes.applicationCommands(api), {
        body: slashCommands,
      });
    }

    logger.debug("Successfully registered slash commands.");

  } catch (error) {
    console.error(error);
  }
}
