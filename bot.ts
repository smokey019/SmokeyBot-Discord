import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import {
  Client,
  CommandInteraction,
  GatewayIntentBits,
  Guild,
  Options,
} from "discord.js";
import { getCache, getGCD, type ICache } from "./clients/cache";
import {
  commands,
  loadCommands,
  registerSlashCommands,
  slashCommands,
} from "./clients/commands";
import { getGuildSettings, type IGuildSettings } from "./clients/database";
import { getLogger } from "./clients/logger";
import { checkExpGain } from "./clients/pokemon/exp-gain";
import { checkSpawn } from "./clients/pokemon/spawn-monster";
import { format_number, getCurrentTime } from "./utils";

const logger = getLogger("DiscordClient");
export let rateLimited = false;
export let initializing = true;

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildEmojisAndStickers, //,
    //GatewayIntentBits.GuildPresences,
  ],
  //shards: 1,
  makeCache: Options.cacheWithLimits({
    ApplicationCommandManager: 0, // guild.commands
    BaseGuildEmojiManager: 0, // guild.emojis
    //ChannelManager: 0, // client.channels
    //GuildChannelManager: 0, // guild.channels
    GuildBanManager: 0, // guild.bans
    GuildInviteManager: 0, // guild.invites
    //GuildManager: Infinity, // client.guilds
    GuildMemberManager: 0, // guild.members
    GuildStickerManager: 0, // guild.stickers
    GuildScheduledEventManager: 0, // guild.scheduledEvents
    MessageManager: 15, // channel.messages
    //PermissionOverwriteManager: 0, // channel.permissionOverwrites
    PresenceManager: 0, // guild.presences
    ReactionManager: 0, // message.reactions
    ReactionUserManager: 0, // reaction.users
    //RoleManager: 0, // guild.roles
    StageInstanceManager: 0, // guild.stageInstances
    ThreadManager: 0, // channel.threads
    ThreadMemberManager: 0, // threadchannel.members
    UserManager: 0, // client.users
    VoiceStateManager: 0, // guild.voiceStates
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 600, // Every hour.
      lifetime: 1200, // Remove messages older than
    },
    users: {
      interval: 600, // Every hour.
      filter: () => (user) => user.bot && user.id !== user.client.user.id, // Remove all bots.
    },
  },
});

discordClient.on("ready", async () => {
  //logger.info(`Total MonsterPool: ${getAllMonsters().length}.`);
  //logger.info(`Total Monsters: ${MonsterDex.size}.`);
  logger.info("Fully initialized.");
  initializing = false;
  await loadCommands();

  setTimeout(async () => {
    await registerSlashCommands();
  }, 15 * 1000);
});

discordClient.on("interactionCreate", async (interaction) => {
  if (!interaction || !interaction?.guild) return;
  const GCD = await getGCD(interaction?.guild?.id);
  const timestamp = getCurrentTime();
  const settings: IGuildSettings = await getGuildSettings(interaction.guild);
  const cache: ICache = await getCache(interaction.guild, settings);

  //logger.debug('\n', interaction);

  if (!interaction.isCommand()) return;

  if (timestamp - GCD < 2) return;

  const command = interaction.commandName;
  const args = []; //[interaction.options.get("input").value.toString()];
  const commandFile = commands.find((_r, n) => n.includes(command));

  //console.log(interaction.options.data[0]);

  if (!commandFile) return;
  else
    commandFile({
      interaction,
      args,
      client: discordClient,
      dev: true,
      settings: settings,
      cache: cache,
    });
});

discordClient.on("messageCreate", async (message) => {
  if (
    message.author.id == "458710213122457600" ||
    message.author.id == "758820204133613598"
  )
    return;
  const settings: IGuildSettings = await getGuildSettings(message.guild);
  const cache: ICache = await getCache(message.guild, settings);

  if (cache && settings) {
    if (cache.settings.smokemon_enabled) {
      await checkExpGain(message.author, message.guild, undefined);
      await checkSpawn(message as unknown as CommandInteraction, cache);
      // console.log(message.content);
      if (
        message.content.match(/twitter|x/gi) &&
        message.author.id == "90514165138989056"
      ) {
        let temp = message.content;
        temp = temp.replace(/twitter|x/gi, "fxtwitter");
        message.reply(temp);
      }
    }
  }
});

/**
 * Register Slash commands for new servers so they can use the commands ASAP. Do I have to do this? (yes)
 */
discordClient.on("guildCreate", async (guild: Guild) => {
  logger.debug(
    `\nRegistered commands in new guild '${guild.name}' ID: '${guild.id}'\n`
  );

  let token = undefined;
  let api = undefined;

  if (JSON.parse(process.env.DEV)) {
    token = process.env.DISCORD_TOKEN_DEV;
    api = process.env.API_CLIENT_ID_DEV;
  } else {
    token = process.env.DISCORD_TOKEN;
    api = process.env.API_CLIENT_ID;
  }

  const rest = new REST().setToken(token);

  await rest.put(Routes.applicationGuildCommands(api, guild.id), {
    body: slashCommands,
  });
});

discordClient.rest.on("rateLimited", (error) => {
  const timeoutStr = error.timeToReset / 1000;
  logger.warn(
    `Rate Limited.. waiting ${format_number(
      Math.round(timeoutStr / 60)
    )} minutes.`
  );
  //console.log(`Last Message:`, last_message);

  rateLimited = true;

  setTimeout(() => {
    logger.warn("Rate limit timeout elapsed.");
    rateLimited = false;
  }, error.timeToReset);
});

discordClient.on("shardError", (error) => {
  console.error("A websocket connection encountered an error:", error);
});

discordClient.on("error", (error) => {
  console.error("Discord Client Error:", error);
});

discordClient.on("shardReady", (id: number) => {
  console.error(`Shard ${id} is ready.`);
});

if (process.env.DEV == "true") {
  discordClient.login(process.env.DISCORD_TOKEN_DEV);
} else {
  discordClient.login(process.env.DISCORD_TOKEN);
}
