import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import {
  ActivityType,
  Client,
  CommandInteraction,
  GatewayIntentBits,
  Guild,
  Message,
  Options,
  PresenceUpdateStatus,
} from "discord.js";
import { getCache, getGCD } from "./clients/cache";
import {
  commands,
  loadCommands,
  registerSlashCommands,
  slashCommands,
} from "./clients/commands";
import { getGuildSettings } from "./clients/database";
import { getLogger } from "./clients/logger";
import { queueMessage } from "./clients/message_queue";
import { checkExpGain } from "./clients/pokemon/exp-gain";
import { checkSpawn } from "./clients/pokemon/spawn-monster";
import { getCurrentTime } from "./utils";

const logger = getLogger("DiscordClient");

// Bun-optimized configuration
const SHARD_ID = parseInt(process.env.SHARD_ID || process.argv.find(arg => arg.startsWith('--shard='))?.split('=')[1] || '0');
const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS || '1');
const IS_COORDINATOR = SHARD_ID === 0;
const IS_DEV = process.env.DEV === "true" || process.argv.includes('--dev');

// Performance constants optimized for Bun
const GLOBAL_COOLDOWN = 2;
const PRESENCE_UPDATE_INTERVAL = 300000; // 5 minutes
const STATS_REPORT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_INTERVAL = 60000; // 1 minute
const MAX_RECONNECT_ATTEMPTS = 5;

// User configuration
const EXCLUDED_USERS = new Set(["458710213122457600", "758820204133613598"]);
const TWITTER_USER = "90514165138989056";

// Bot activities for presence
const ACTIVITIES = [
  { name: "with Pokémon", type: ActivityType.Playing },
  { name: "trainers catch Pokémon", type: ActivityType.Watching },
  { name: "epic Pokémon battles", type: ActivityType.Listening },
  { name: "for shiny Pokémon", type: ActivityType.Watching },
];

// Lightweight interfaces for Bun performance
interface ShardState {
  rateLimited: boolean;
  initializing: boolean;
  lastActivity: number;
  reconnectAttempts: number;
  healthScore: number;
  guildsReady: Set<string>;
}

interface ShardStats {
  guilds: number;
  users: number;
  channels: number;
  uptime: number;
  ping: number;
  memory: number;
  commandsExecuted: number;
  messagesProcessed: number;
}

interface GlobalRateLimit {
  isActive: boolean;
  endTime: number;
  route?: string;
}

// Optimized state management for Bun
const shardState: ShardState = {
  rateLimited: false,
  initializing: true,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  healthScore: 100,
  guildsReady: new Set(),
};

const globalRateLimit: GlobalRateLimit = {
  isActive: false,
  endTime: 0,
};

// Performance counters
let commandsExecuted = 0;
let messagesProcessed = 0;

// Backward compatibility exports
export let rateLimited = false;
export let initializing = true;

// Enhanced Discord client optimized for Bun runtime
export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildExpressions,
    //GatewayIntentBits.MessageContent,
  ],
  //shards: SHARD_ID,
  //shardCount: TOTAL_SHARDS,
  presence: {
    status: PresenceUpdateStatus.Online,
    //activities: [ACTIVITIES[0]]
  },
  // Bun-optimized cache settings
  makeCache: Options.cacheWithLimits({
    ApplicationCommandManager: 0,
    BaseGuildEmojiManager: 0,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildMemberManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    MessageManager: IS_DEV ? 50 : 20, // Optimized for Bun's memory efficiency
    PresenceManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
    StageInstanceManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    UserManager: 0,
    VoiceStateManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 300, // More frequent with Bun's efficiency
      lifetime: IS_DEV ? 300 : 600,
    },
    users: {
      interval: 300,
      filter: () => (user) => user.bot && user.id !== user.client.user.id,
    },
  },
});

// ============================================================================
// STREAMLINED SHARD COMMUNICATION (works with enhanced index.ts)
// ============================================================================

/**
 * Send structured message to shard manager
 */
function sendToManager(type: string, data: any): void {
  try {
    // Send to the enhanced shard manager
    process.send?.({ type, shardId: SHARD_ID, data, timestamp: Date.now() });
  } catch (error) {
    logger.error('Failed to send message to manager:', error);
  }
}

/**
 * Report health stats to manager
 */
function reportStats(): void {
  const stats: ShardStats = {
    guilds: discordClient.guilds.cache.size,
    users: discordClient.users.cache.size,
    channels: discordClient.channels.cache.size,
    uptime: discordClient.uptime || 0,
    ping: discordClient.ws.ping,
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
    commandsExecuted,
    messagesProcessed,
  };

  sendToManager('stats', stats);
  sendToManager('health', {
    healthy: isHealthy(),
    score: shardState.healthScore,
    lastActivity: shardState.lastActivity,
    status: discordClient.ws.status,
  });
}

/**
 * Send heartbeat to manager
 */
function sendHeartbeat(): void {
  sendToManager('heartbeat', {
    timestamp: Date.now(),
    ping: discordClient.ws.ping,
    guilds: discordClient.guilds.cache.size,
  });
}

// ============================================================================
// OPTIMIZED PRESENCE MANAGEMENT
// ============================================================================

/**
 * Update presence based on coordinator broadcasts or local logic
 */
function updatePresence(activity?: any): void {
  try {
    const selectedActivity = activity || (IS_COORDINATOR ?
      ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)] :
      ACTIVITIES[0]
    );

    discordClient.user?.setPresence({
      status: globalRateLimit.isActive ? PresenceUpdateStatus.Idle : PresenceUpdateStatus.Online,
      //activities: [selectedActivity]
    });

  } catch (error) {
    logger.warn('Presence update failed:', error);
  }
}

// ============================================================================
// OPTIMIZED COMMAND EXECUTION
// ============================================================================

/**
 * Streamlined command execution for Bun performance
 */
async function executeCommand(interaction: CommandInteraction): Promise<void> {
  const startTime = Bun.nanoseconds(); // Use Bun's high-precision timer

  try {
    if (!interaction.guild) return;

    // Fast cooldown check
    const gcd = await getGCD(interaction.guild.id);
    if (getCurrentTime() - (gcd || 0) < GLOBAL_COOLDOWN) return;
    if (globalRateLimit.isActive && Date.now() < globalRateLimit.endTime) return;

    // Parallel settings fetch (Bun optimized)
    const [settings, cache] = await Promise.all([
      getGuildSettings(interaction.guild),
      getGuildSettings(interaction.guild).then(s => getCache(interaction.guild, s))
    ]);

    if (!settings || !cache) {
      await queueMessage("Configuration error. Try again.", interaction, false);
      return;
    }

    // Find command
    const commandFile = commands.find((_r, names) => names.includes(interaction.commandName));
    if (!commandFile) {
      await queueMessage("Command not found.", interaction, false);
      return;
    }

    // Execute with minimal overhead
    await commandFile({
      interaction,
      args: [],
      client: discordClient,
      dev: IS_DEV,
      settings,
      cache,
    });

    // Update metrics
    commandsExecuted++;
    shardState.lastActivity = Date.now();

    // Log slow commands in dev
    if (IS_DEV) {
      const duration = Number(Bun.nanoseconds() - startTime) / 1_000_000; // Convert to ms
      if (duration > 1000) {
        logger.warn(`Slow command: ${interaction.commandName} took ${duration.toFixed(2)}ms`);
      }
    }

  } catch (error) {
    logger.error(`Command error:`, error);
    try {
      await queueMessage("Command failed. Try again.", interaction, false);
    } catch (replyError) {
      logger.error('Error response failed:', replyError);
    }
  }
}

// ============================================================================
// OPTIMIZED MESSAGE PROCESSING
// ============================================================================

/**
 * High-performance message processing for Bun
 */
async function processMessage(message: Message): Promise<void> {
  try {
    // Fast filtering
    if (EXCLUDED_USERS.has(message.author.id) ||
        message.author.bot ||
        !message.guild ||
        globalRateLimit.isActive) {
      return;
    }

    const startTime = Bun.nanoseconds();

    // Optimized settings fetch
    const [settings, cache] = await Promise.all([
      getGuildSettings(message.guild),
      getGuildSettings(message.guild).then(s => getCache(message.guild, s))
    ]);

    if (!cache?.settings?.smokemon_enabled) return;

    // Parallel Pokemon processing
    const tasks = [
      checkExpGain(message.author, message.guild, undefined),
      checkSpawn(message as unknown as CommandInteraction, cache)
    ];

    // Twitter link replacement (optimized)
    if (message.author.id === TWITTER_USER && /(?:twitter|x)\.com/gi.test(message.content)) {
      tasks.push(
        message.reply({
          content: message.content.replace(/(?:twitter|x)\.com/gi, "fxtwitter.com"),
          allowedMentions: { repliedUser: false }
        }).catch(err => logger.warn('Twitter replacement failed:', err))
      );
    }

    await Promise.allSettled(tasks);

    // Update metrics
    messagesProcessed++;
    shardState.lastActivity = Date.now();

    // Performance monitoring in dev
    if (IS_DEV) {
      const duration = Number(Bun.nanoseconds() - startTime) / 1_000_000;
      if (duration > 500) {
        logger.warn(`Slow message processing: ${duration.toFixed(2)}ms`);
      }
    }

  } catch (error) {
    logger.error('Message processing error:', error);
  }
}

// ============================================================================
// SIMPLIFIED COMMAND REGISTRATION
// ============================================================================

/**
 * Register commands for new guild (streamlined)
 */
async function registerGuildCommands(guild: Guild): Promise<void> {
  try {
    const token = IS_DEV ? process.env.DISCORD_TOKEN_DEV : process.env.DISCORD_TOKEN;
    const clientId = IS_DEV ? process.env.API_CLIENT_ID_DEV : process.env.API_CLIENT_ID;

    if (!token || !clientId) return;

    const rest = new REST({ version: '10', timeout: 15000 }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
      body: slashCommands,
    });

    shardState.guildsReady.add(guild.id);
    logger.info(`Registered commands for '${guild.name}' (${slashCommands.length} commands)`);

  } catch (error) {
    logger.error(`Command registration failed for ${guild.name}:`, error);
  }
}

// ============================================================================
// STREAMLINED RATE LIMIT HANDLING
// ============================================================================

/**
 * Handle rate limits with manager coordination
 */
function handleRateLimit(rateLimitData: any): void {
  const minutes = Math.round(rateLimitData.timeToReset / 60000);
  logger.warn(`Rate limited for ${minutes}m (${rateLimitData.route || 'unknown'})`);

  // Update state
  globalRateLimit.isActive = true;
  globalRateLimit.endTime = Date.now() + rateLimitData.timeToReset;
  globalRateLimit.route = rateLimitData.route;

  shardState.rateLimited = true;
  rateLimited = true;

  // Notify manager
  sendToManager('rateLimit', globalRateLimit);
  updatePresence(); // Show idle status

  // Reset after timeout
  setTimeout(() => {
    globalRateLimit.isActive = false;
    globalRateLimit.endTime = 0;
    shardState.rateLimited = false;
    rateLimited = false;

    sendToManager('rateLimitEnd', {});
    updatePresence(); // Reset status
    logger.info('Rate limit ended');
  }, rateLimitData.timeToReset);
}

// ============================================================================
// HEALTH & UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if shard is healthy
 */
function isHealthy(): boolean {
  const now = Date.now();
  return !shardState.initializing &&
         !shardState.rateLimited &&
         (now - shardState.lastActivity) < 300000 &&
         discordClient.isReady() &&
         shardState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS;
}

/**
 * Handle graceful shutdown
 */
async function shutdown(): Promise<void> {
  logger.info(`Shard ${SHARD_ID}: Shutting down...`);
  try {
    await discordClient.destroy();
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown error:', error);
    process.exit(1);
  }
}

// ============================================================================
// EVENT HANDLERS (Streamlined)
// ============================================================================

discordClient.on("ready", async () => {
  try {
    logger.info(`Discord client ready as ${discordClient.user?.tag}`);
    logger.info(`Connected to ${discordClient.guilds.cache.size} guilds`);

    // Load commands
    await loadCommands();

    // Global slash command registration (coordinator only)
    if (IS_COORDINATOR) {
      setTimeout(async () => {
        try {
          await registerSlashCommands();
          logger.info('Global commands registered');
        } catch (error) {
          logger.error('Global command registration failed:', error);
        }
      }, 15000);

      // Update presence every 5 minutes
      setInterval(updatePresence, PRESENCE_UPDATE_INTERVAL);
    }

    // Report stats every 30 seconds
    setInterval(reportStats, STATS_REPORT_INTERVAL);

    // Send heartbeat every minute
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    shardState.initializing = false;
    initializing = false;

    // Initial stats report
    setTimeout(reportStats, 5000);

    logger.info(`Discord client ready.`);

  } catch (error) {
    logger.error('Ready event error:', error);
    shardState.initializing = false;
    initializing = false;
  }
});

discordClient.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    await executeCommand(interaction);
  }
});

discordClient.on("messageCreate", processMessage);

discordClient.on("guildCreate", async (guild: Guild) => {
  logger.info(`+Guild: ${guild.name} (${guild.memberCount} members)`);
  await registerGuildCommands(guild);
});

discordClient.on("guildDelete", (guild: Guild) => {
  logger.info(`-Guild: ${guild.name}`);
  shardState.guildsReady.delete(guild.id);
});

discordClient.rest.on("rateLimited", handleRateLimit);

// Error handlers
discordClient.on("shardError", (error, shardId) => {
  logger.error(`Shard ${shardId} error:`, error);
  shardState.reconnectAttempts++;
  shardState.healthScore = Math.max(0, shardState.healthScore - 20);
});

discordClient.on("shardReady", (shardId: number) => {
  logger.info(`Shard ${shardId}: Connected`);
  shardState.reconnectAttempts = 0;
  shardState.healthScore = 100;
});

discordClient.on("shardReconnecting", (shardId: number) => {
  logger.warn(`Shard ${shardId}: Reconnecting...`);
});

discordClient.on("error", (error) => logger.error('Client error:', error));
discordClient.on("warn", (warning) => logger.warn('Client warning:', warning));

// ============================================================================
// PROCESS HANDLERS
// ============================================================================

// Handle messages from shard manager
process.on('message', (message: any) => {
  try {
    if (message.type === 'presenceUpdate') {
      updatePresence(message.data);
    } else if (message.type === 'shutdown') {
      shutdown();
    } else if (message.type === 'rateLimitUpdate') {
      Object.assign(globalRateLimit, message.data);
      shardState.rateLimited = globalRateLimit.isActive;
      rateLimited = globalRateLimit.isActive;
    }
  } catch (error) {
    logger.error('Message handling error:', error);
  }
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  sendToManager('emergency', { error: error.message, shardId: SHARD_ID });
  process.exit(1);
});

// ============================================================================
// EXPORTS & STARTUP
// ============================================================================

// Enhanced exports for backward compatibility
export function getShardStats() {
  return {
    shardId: SHARD_ID,
    totalShards: TOTAL_SHARDS,
    isCoordinator: IS_COORDINATOR,
    guilds: discordClient.guilds.cache.size,
    users: discordClient.users.cache.size,
    channels: discordClient.channels.cache.size,
    uptime: discordClient.uptime || 0,
    ping: discordClient.ws.ping,
    rateLimited: shardState.rateLimited,
    initializing: shardState.initializing,
    lastActivity: shardState.lastActivity,
    healthScore: shardState.healthScore,
    commandsExecuted,
    messagesProcessed,
    memory: process.memoryUsage(),
  };
}

export const getBotStats = getShardStats; // Backward compatibility
export const isShardHealthy = isHealthy;
export const emergencyShutdown = shutdown;

/**
 * Optimized startup for Bun runtime
 */
async function startBot(): Promise<void> {
  try {
    const token = IS_DEV ? process.env.DISCORD_TOKEN_DEV : process.env.DISCORD_TOKEN;

    if (!token) {
      throw new Error(`Missing token: ${IS_DEV ? 'DISCORD_TOKEN_DEV' : 'DISCORD_TOKEN'}`);
    }

    logger.info(`Starting SmokeyBot Shard ${SHARD_ID}/${TOTAL_SHARDS}`);
    logger.info(`Runtime: Bun ${Bun.version}`);
    logger.info(`Mode: ${IS_DEV ? 'Development' : 'Production'}`);
    logger.info(`Role: ${IS_COORDINATOR ? 'Coordinator' : 'Worker'}`);

    await discordClient.login(token);

  } catch (error) {
    logger.error('Startup failed:', error);
    process.exit(1);
  }
}

// Start the bot
startBot();

export default discordClient;