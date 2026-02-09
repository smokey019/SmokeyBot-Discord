import { REST } from "@discordjs/rest";
import { heapStats } from "bun:jsc";
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
import {
  createRedisManager,
  createWebSocketClientManager,
  type CommunicationManager,
  type InterShardMessage,
} from "./clients/communication";
import { getGuildSettings } from "./clients/database";
import { getLogger } from "./clients/logger";
import { queueMessage } from "./clients/message_queue";
import { disposeEmoteQueue } from "./clients/emote_queue";
import { checkExpGain } from "./clients/pokemon/exp-gain";
import { checkSpawn } from "./clients/pokemon/spawn-monster";
import { getCurrentTime } from "./utils";

const logger = getLogger("DiscordClient");
let loaded_commands = false;

// Extract isDev before config to avoid temporal dead zone issues
const isDev = process.env.DEV === "true" || process.argv.includes("--dev");

// Constants for better maintainability
const CONSTANTS = {
  COMMAND_TIMEOUT: 30000, // 30 seconds
  ACTIVITY_TIMEOUT: 300000, // 5 minutes
  GLOBAL_COMMAND_DELAY: 15000, // 15 seconds
  SHUTDOWN_GRACE_PERIOD: 2000, // 2 seconds
  STATS_INITIAL_DELAY: 5000, // 5 seconds
  SLOW_COMMAND_THRESHOLD: 1000, // 1 second
  SLOW_MESSAGE_THRESHOLD: 500, // 500ms
  HIGH_MEMORY_WARNING: 500, // 500MB
  CRITICAL_MEMORY_SHUTDOWN: 1000, // 1000MB (1GB)
  MEMORY_CHECK_INTERVAL: 60000, // 1 minute
  GC_INTERVAL: 600000, // 10 minutes
  EVENT_LOOP_CHECK_INTERVAL: 10000, // 10 seconds
  WEBSOCKET_RECONNECT_DELAY: 5000, // 5 seconds
  WEBSOCKET_RETRY_DELAY: 1000, // 1 second between port attempts
  PROCESSED_INTERACTIONS_LIMIT: 1000,
  PROCESSED_INTERACTIONS_KEEP: 500,
  PROCESSED_INTERACTIONS_EXPIRY: 300000, // 5 minutes
  MAX_ERRORS_THRESHOLD: 50,
  MIN_HEALTH_SCORE: 20,
  MIN_HEALTHY_CONDITIONS: 5,
  EVENT_LOOP_LAG_HISTORY_SIZE: 10,
} as const;

// configuration with environment validation
const config = {
  // Use temporary shard ID until Discord.js assigns the real one
  shardId: parseInt(
    process.env.SHARD_ID ||
    process.argv.find((arg) => arg.startsWith("--shard="))?.split("=")[1] ||
    "0"
  ),
  actualShardId: -1, // Will be set by Discord.js in ready event
  totalShards: parseInt(process.env.TOTAL_SHARDS || "1"),
  isDev,
  globalCooldown: parseInt(process.env.GLOBAL_COOLDOWN || "2"),
  presenceUpdateInterval: parseInt(
    process.env.PRESENCE_UPDATE_INTERVAL || "300000"
  ), // 5 minutes
  statsReportInterval: parseInt(process.env.STATS_REPORT_INTERVAL || "30000"), // 30 seconds
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "60000"), // 1 minute
  maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || "5"),
  // Communication settings - developer ports to avoid conflicts
  redisUrl: process.env.REDIS_URL || (isDev ? "redis://localhost:6380" : "redis://localhost:6379"),
  wsManagerUrl: process.env.WS_MANAGER_URL || (isDev ? "ws://localhost:8081" : "ws://localhost:8080"),
  useRedis: process.env.USE_REDIS === "true",
  useWebSocket: process.env.USE_WEBSOCKET === "true",
  // Cross-server communication (only needed for multi-server deployments)
  forceCrossServerComm: process.env.FORCE_CROSS_SERVER_COMM === "true",
  // Performance settings
  messageMemoryLimit: parseInt(
    process.env.MESSAGE_MEMORY_LIMIT || (isDev ? "50" : "20")
  ),
  sweepInterval: parseInt(process.env.SWEEP_INTERVAL || "300"),
  messageLifetime: parseInt(
    process.env.MESSAGE_LIFETIME || (isDev ? "300" : "600")
  ),
};

// Computed values - will be updated when actual shard ID is known
let IS_COORDINATOR = config.shardId === 0;
const EXCLUDED_USERS = new Set(["458710213122457600", "758820204133613598"]);

// bot activities
const ACTIVITIES = [
  { name: "with Pokémon", type: ActivityType.Playing },
  { name: "trainers catch Pokémon", type: ActivityType.Watching },
  { name: "epic Pokémon battles", type: ActivityType.Listening },
  { name: "for shiny Pokémon", type: ActivityType.Watching },
  { name: "Pokémon evolutions", type: ActivityType.Watching },
  { name: "legendary encounters", type: ActivityType.Competing },
];

// interfaces for better type safety
interface ShardState {
  rateLimited: boolean;
  initializing: boolean;
  lastActivity: number;
  reconnectAttempts: number;
  healthScore: number;
  guildsReady: Set<string>;
  communicationConnected: boolean;
  lastHeartbeat: number;
  errors: number;
  startTime: number;
}

interface ShardMetrics {
  guilds: number;
  users: number;
  channels: number;
  uptime: number;
  ping: number;
  memory: NodeJS.MemoryUsage;
  commandsExecuted: number;
  messagesProcessed: number;
  cpu: number;
  eventLoopLag: number;
  errors: number;
  guildDetails?: GuildShardInfo[];
}

interface GuildShardInfo {
  id: string;
  name: string;
  memberCount: number;
  shardId: number;
  joinedAt: number;
}

interface GlobalRateLimit {
  isActive: boolean;
  endTime: number;
  route?: string;
  retryAfter?: number;
}

// Communication manager classes and interfaces are now imported from shared module
// See: clients/communication/index.ts

// state management
const shardState: ShardState = {
  rateLimited: false,
  initializing: true,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  healthScore: 100,
  guildsReady: new Set(),
  communicationConnected: false,
  lastHeartbeat: Date.now(),
  errors: 0,
  startTime: Date.now(),
};

const globalRateLimit: GlobalRateLimit = {
  isActive: false,
  endTime: 0,
};

// Performance counters
let commandsExecuted = 0;
let messagesProcessed = 0;
let lastCpuUsage = process.cpuUsage();
let eventLoopLagHistory: number[] = [];

// Backward compatibility exports - these will be updated when state changes
export let rateLimited = false;
export let initializing = true;

// Efficient message ID generator with counter reset to prevent overflow
let messageIdCounter = 0;
function generateMessageId(): string {
  // Reset counter if it gets too large to prevent memory issues
  if (messageIdCounter >= 100000) messageIdCounter = 0;
  return `${Date.now()}-${(messageIdCounter++).toString(36)}`;
}

// Cached shard ID to avoid repeated function calls
let cachedShardId: number | null = null;

// Interval tracking for cleanup
const intervals = {
  presenceUpdate: undefined as Timer | undefined,
  statsReport: undefined as Timer | undefined,
  heartbeat: undefined as Timer | undefined,
  eventLoopMonitor: undefined as Timer | undefined,
  memoryMonitor: undefined as Timer | undefined,
  gcMonitor: undefined as Timer | undefined,
};

// Communication manager instance - only for cross-server deployment
let communicationManager: CommunicationManager | undefined;

// Communication manager is only used for cross-server communication
// Same-server shards always use direct manager routing

// Discord client optimized for Bun
export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildExpressions,
    // GatewayIntentBits.MessageContent, // Uncomment when permission available
  ],
  presence: {
    status: PresenceUpdateStatus.Online,
    //activities: [ACTIVITIES[0]],
  },
  // Memory-optimized cache settings for Discord.js 14.20+
  makeCache: Options.cacheWithLimits({
    // Application & Command caches - disable if not using slash commands
    ApplicationCommandManager: 0,
    AutoModerationRuleManager: 0,

    // Channel-related caches - major memory savers
    ThreadManager: 0, // Disable thread caching unless needed
    ThreadMemberManager: 0,

    // Emoji & Sticker caches
    BaseGuildEmojiManager: 0,
    GuildStickerManager: 0,

    // Guild management caches
    GuildBanManager: 0, // Only cache if you need ban info
    GuildInviteManager: 0, // Disable unless tracking invites
    GuildScheduledEventManager: 0,

    // Member & User caches - CRITICAL for memory with 1000+ guilds
    // Each guild caches members, so 5 × 1000 guilds = 5,000 cached members
    GuildMemberManager: {
      maxSize: 5, // Further reduced from 10 - saves more memory
      keepOverLimit: (member) => {
        // Keep only bot itself and administrators
        return member.id === member.client.user.id ||
          member.permissions?.has('Administrator');
      },
    },
    UserManager: {
      maxSize: 5, // Further reduced from 10
      keepOverLimit: (user) => user.id === user.client.user.id,
    },

    // Message caching - biggest memory consumer per guild
    MessageManager: Math.min(config.messageMemoryLimit || 3, 3), // Further reduced to 3

    // Presence & Voice - disable unless needed
    PresenceManager: 0,
    VoiceStateManager: 0,

    // Reaction caches - disable unless needed
    ReactionManager: 0,
    ReactionUserManager: 0,

    // Stage & Integration caches
    StageInstanceManager: 0,
  }),

  // Aggressive sweeping configuration
  sweepers: {
    ...Options.DefaultSweeperSettings,

    // Message sweeping - most important for memory
    messages: {
      interval: Math.min(config.sweepInterval || 300, 300), // Max 5 minutes
      lifetime: Math.min(config.messageLifetime || 3600, 1800), // Max 30 minutes
    },

    // User sweeping - remove cached users aggressively
    users: {
      interval: config.sweepInterval || 300,
      filter: () => (user) => {
        if (user.id === user.client.user.id) return false;
        return true;
      },
    },

    // Guild member sweeping
    guildMembers: {
      interval: 600, // 10 minutes
      filter: () => (member) => {
        // Keep privileged members and the bot itself
        if (member.id === member.client.user.id) return false;
        if (member.permissions?.has('Administrator')) return false;
        if (member.permissions?.has('ManageGuild')) return false;
        return true;
      },
    },

    // Thread sweeping - if you use threads
    threads: {
      interval: 3600, // 1 hour
      lifetime: 14400, // 4 hours
    },

    // Presence sweeping
    presences: {
      interval: 300, // 5 minutes
      filter: () => () => true, // Sweep all presences
    },
  },

  // Additional memory optimizations
  allowedMentions: {
    parse: ['users'], // Limit mention parsing
    repliedUser: false,
  },

  // Disable unnecessary REST options that can consume memory
  rest: {
    timeout: 15000,
    retries: 2,
  },

  // WebSocket options for better memory management
  ws: {
  },
});

// ============================================================================
// COMMUNICATION SYSTEM
// ============================================================================

/**
 * Get the current shard ID with proper fallback logic and caching
 */
function getCurrentShardId(): number {
  // Return cached value if available
  if (cachedShardId !== null) {
    return cachedShardId;
  }

  // Calculate and cache the shard ID
  let shardId: number;
  if (config.actualShardId >= 0) {
    shardId = config.actualShardId;
  } else if (config.isDev && (config.totalShards === 1 || isNaN(config.totalShards))) {
    shardId = 0;
  } else {
    shardId = config.shardId >= 0 ? config.shardId : 0;
  }

  cachedShardId = shardId;
  return shardId;
}

/**
 * Update the cached shard ID (called when actualShardId changes)
 */
function updateCachedShardId(newShardId: number): void {
  cachedShardId = newShardId;
}

/**
 * Send message to shard manager (backward compatibility)
 */
function sendToManager(type: string, data: any): void {
  try {
    process.send?.({
      type,
      shardId: getCurrentShardId(),
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error("Failed to send message to manager:", error);
  }
}

/**
 * Send inter-shard message
 */
async function sendInterShardMessage(
  type: string,
  data: any,
  toShard?: number | "all"
): Promise<void> {
  // Use centralized shard ID resolution
  const currentShardId = getCurrentShardId();

  const message: InterShardMessage = {
    type,
    fromShard: currentShardId,
    toShard: toShard || "all",
    data,
    timestamp: Date.now(),
    id: generateMessageId(),
  };

  // Skip sending if it's a single shard and message is to self
  if ((config.totalShards === 1 || isNaN(config.totalShards)) && (toShard === currentShardId || toShard === "all")) {
    logger.debug(`Skipping self-message in single shard mode: ${type}`);
    return;
  }

  try {
    // Always send through manager for consistent routing
    // This eliminates the dual communication path complexity
    sendToManager("inter-shard", message);
  } catch (error) {
    logger.error("Failed to send inter-shard message:", error);
  }
}

/**
 * Handle inter-shard messages
 */
async function handleInterShardMessage(message: InterShardMessage): Promise<void> {
  logger.trace(`Received inter-shard message: ${message.type}`);

  switch (message.type) {
    case "presenceUpdate":
      updatePresence(message.data.activity);
      break;

    case "rateLimitSync":
      Object.assign(globalRateLimit, message.data);
      shardState.rateLimited = globalRateLimit.isActive;
      rateLimited = globalRateLimit.isActive;
      break;

    case "globalAnnouncement":
      handleGlobalAnnouncement(message.data);
      break;

    case "shardCommand":
      handleShardCommand(message.data);
      break;

    case "healthCheck":
      respondToHealthCheck(message);
      break;

    case "globalCommandsReady":
      loaded_commands = true;
      logger.debug(`Received loaded commands.`);
      break;

    case "ready":
      logger.debug(`Another shard has joined.`);
      break;

    case "guildStatsRequest":
      await respondToGuildStatsRequest(message);
      break;


    case "guildJoined":
    case "guildLeft":
      // Already handled in the existing guildCreate/guildDelete events
      logger.debug(`Guild ${message.data.shardId ? 'on shard ' + message.data.shardId : ''} ${message.type === 'guildJoined' ? 'joined' : 'left'}: ${message.data.guildName}`);
      break;

    default:
      logger.debug(`Unknown inter-shard message type: ${message.type}`);
  }
}

/**
 * Handle global announcements
 */
async function handleGlobalAnnouncement(data: any): Promise<void> {
  // Implementation for global announcements across all shards
  logger.info(`Global announcement: ${data.message}`);
}

/**
 * Handle shard-specific commands
 */
async function handleShardCommand(data: any): Promise<void> {
  switch (data.command) {
    case "restart":
      logger.info("Received restart command");
      await shutdown();
      break;

    case "updateStats":
      reportStats();
      break;

    case "clearCache":
      // Clear specific caches if needed
      logger.info("Cache clear requested");
      break;

    default:
      logger.warn(`Unknown shard command: ${data.command}`);
  }
}

/**
 * Respond to health check requests
 */
async function respondToHealthCheck(message: InterShardMessage): Promise<void> {
  const health = await getDetailedHealth();
  // Only respond if fromShard is valid
  if (message.fromShard !== undefined && message.fromShard >= 0) {
    await sendInterShardMessage("healthResponse", health, message.fromShard);
  }
}

/**
 * Respond to guild stats requests
 */
async function respondToGuildStatsRequest(message: InterShardMessage): Promise<void> {
  const guildStats = await getGuildShardStats();
  const currentShardId = config.actualShardId >= 0 ? config.actualShardId : config.shardId;

  // Send guild stats to manager via process message
  sendToManager("guildStatsReceived", {
    shardId: currentShardId,
    guilds: guildStats,
    requestId: message.data.requestId
  });
}


/**
 * Get detailed guild information for this shard
 */
async function getGuildShardStats(): Promise<GuildShardInfo[]> {
  const guilds: GuildShardInfo[] = [];
  const currentShardId = config.actualShardId >= 0 ? config.actualShardId : config.shardId;

  for (const [, guild] of discordClient.guilds.cache) {
    try {
      guilds.push({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount || 0,
        shardId: currentShardId,
        joinedAt: guild.joinedTimestamp || Date.now()
      });
    } catch (error) {
      logger.warn(`Failed to get stats for guild ${guild.name}:`, error);
    }
  }

  return guilds;
}

// ============================================================================
// METRICS AND MONITORING
// ============================================================================

/**
 * Calculate CPU usage percentage
 */
function calculateCpuUsage(): number {
  const currentUsage = process.cpuUsage();
  const userUsage = currentUsage.user - lastCpuUsage.user;
  const systemUsage = currentUsage.system - lastCpuUsage.system;
  lastCpuUsage = currentUsage;

  // Convert to percentage (rough approximation)
  return ((userUsage + systemUsage) / 1000000) * 100;
}

/**
 * Measure event loop lag (simplified)
 */
async function measureEventLoopLag(): Promise<number> {
  const start = Bun.nanoseconds();
  return new Promise<number>((resolve) => {
    setImmediate(() => {
      const lag = Number(Bun.nanoseconds() - start) / 1_000_000; // Convert to ms
      eventLoopLagHistory.push(lag);
      if (eventLoopLagHistory.length > CONSTANTS.EVENT_LOOP_LAG_HISTORY_SIZE) {
        eventLoopLagHistory.shift();
      }
      resolve(lag);
    });
  });
}

/**
 * Get average event loop lag
 */
function getAverageEventLoopLag(): number {
  if (eventLoopLagHistory.length === 0) return 0;
  return (
    eventLoopLagHistory.reduce((sum, lag) => sum + lag, 0) /
    eventLoopLagHistory.length
  );
}

/**
 * Get comprehensive shard metrics
 */
async function getShardMetrics(): Promise<ShardMetrics> {
  const eventLoopLag = await measureEventLoopLag();
  const guildDetails = await getGuildShardStats();

  return {
    guilds: discordClient.guilds.cache.size,
    users: discordClient.users.cache.size,
    channels: discordClient.channels.cache.size,
    uptime: discordClient.uptime || 0,
    ping: discordClient.ws.ping,
    memory: process.memoryUsage(),
    commandsExecuted,
    messagesProcessed,
    cpu: calculateCpuUsage(),
    eventLoopLag,
    errors: shardState.errors,
    guildDetails,
  };
}

/**
 * Get detailed health information
 */
async function getDetailedHealth(): Promise<any> {
  const metrics = await getShardMetrics();

  return {
    shardId: getCurrentShardId(),
    actualShardId: config.actualShardId,
    healthy: isHealthy(),
    score: shardState.healthScore,
    lastActivity: shardState.lastActivity,
    status: discordClient.ws.status,
    communicationConnected: shardState.communicationConnected,
    metrics,
    rateLimit: globalRateLimit,
    guildsReady: shardState.guildsReady.size,
    reconnectAttempts: shardState.reconnectAttempts,
    uptime: Date.now() - shardState.startTime,
  };
}

/**
 * stats reporting
 */
async function reportStats(): Promise<void> {
  try {
    const metrics = await getShardMetrics();

    // Send to manager (backward compatibility)
    sendToManager("stats", metrics);

    // Send health data
    const health = await getDetailedHealth();
    sendToManager("health", health);

    // Update last heartbeat
    shardState.lastHeartbeat = Date.now();
  } catch (error) {
    logger.error("Failed to report stats:", error);
    shardState.errors++;
  }
}

/**
 * Send heartbeat with data
 */
function sendHeartbeat(): void {
  const heartbeatData = {
    timestamp: Date.now(),
    ping: discordClient.ws.ping,
    guilds: discordClient.guilds.cache.size,
    healthy: isHealthy(),
    communicationConnected: shardState.communicationConnected,
  };

  sendToManager("heartbeat", heartbeatData);
  shardState.lastHeartbeat = Date.now();
}

// ============================================================================
// PRESENCE MANAGEMENT
// ============================================================================

/**
 * presence updates with activity rotation
 */
function updatePresence(activity?: any): void {
  try {
    const selectedActivity =
      activity ||
      (IS_COORDINATOR
        ? ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)]
        : ACTIVITIES[0]);

    if (config.isDev) {
      logger.debug(`Selected activity: ${selectedActivity?.name}`);
    }

    const status = globalRateLimit.isActive
      ? PresenceUpdateStatus.Idle
      : shardState.healthScore < 50
        ? PresenceUpdateStatus.DoNotDisturb
        : PresenceUpdateStatus.Online;

    discordClient.user?.setPresence({
      status,
      //activities: [selectedActivity],
    });

    // Broadcast presence update to other shards if coordinator
    if (IS_COORDINATOR) {
      //sendInterShardMessage("presenceUpdate", { activity: selectedActivity });
    }
  } catch (error) {
    logger.warn("Presence update failed:", error);
    shardState.errors++;
  }
}

// ============================================================================
// OPTIMIZED COMMAND EXECUTION
// ============================================================================

/**
 * command execution with comprehensive error handling
 */
async function executeCommand(interaction: CommandInteraction): Promise<void> {
  const startTime = Bun.nanoseconds();

  // Debug logging for development mode
  if (config.isDev) {
    logger.debug(`[Shard ${config.actualShardId}] Processing command: ${interaction.commandName} from ${interaction.user.username} in ${interaction.guild?.name}`);
  }

  try {
    if (!interaction.guild) return;

    // cooldown and rate limit checks
    const [gcd, currentTime] = await Promise.all([
      getGCD(interaction.guild.id),
      Promise.resolve(getCurrentTime()),
    ]);

    if (currentTime - (gcd || 0) < config.globalCooldown) return;
    if (globalRateLimit.isActive && Date.now() < globalRateLimit.endTime) {
      await queueMessage(
        "Bot is currently rate limited. Please try again later.",
        interaction,
        false
      );
      return;
    }

    // Get guild settings first, then cache
    const settings = await getGuildSettings(interaction.guild);
    if (!settings) {
      await queueMessage("Configuration error. Please try again later.", interaction, false);
      return;
    }

    const cache = await getCache(interaction.guild, settings);

    if (!cache) {
      await queueMessage("Configuration error. Please try again later.", interaction, false);
      return;
    }

    // Find and validate command
    const commandFile = commands.find((_r, names) =>
      names.includes(interaction.commandName)
    );

    if (!commandFile) {
      await queueMessage("Command not found.", interaction, false);
      return;
    }

    // Execute command with timeout
    const commandPromise = commandFile({
      interaction,
      args: [],
      client: discordClient,
      dev: config.isDev,
      settings,
      cache,
    });

    // Add timeout for command execution
    let commandTimeoutHandle: Timer;
    const timeoutPromise = new Promise((_, reject) =>
      commandTimeoutHandle = setTimeout(() => reject(new Error("Command timeout")), CONSTANTS.COMMAND_TIMEOUT)
    );

    try {
      await Promise.race([commandPromise, timeoutPromise]);
    } finally {
      clearTimeout(commandTimeoutHandle!);
    }

    // Update metrics and state
    commandsExecuted++;
    shardState.lastActivity = Date.now();
    shardState.healthScore = Math.min(100, shardState.healthScore + 1);

    // Performance monitoring
    if (config.isDev) {
      const duration = Number(Bun.nanoseconds() - startTime) / 1_000_000;
      if (duration > CONSTANTS.SLOW_COMMAND_THRESHOLD) {
        logger.warn(
          `Slow command: ${interaction.commandName} took ${duration.toFixed(
            2
          )}ms`
        );
      }
    }
  } catch (error) {
    logger.error(`Command execution error:`, error);
    shardState.errors++;
    shardState.healthScore = Math.max(0, shardState.healthScore - 5);

    try {
      await queueMessage(
        "An error occurred while executing the command. Please try again.",
        interaction,
        false
      );
    } catch (replyError) {
      logger.error("Error response failed:", replyError);
    }
  }
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

/**
 * High-performance message processing with comprehensive error handling
 */
async function processMessage(message: Message): Promise<void> {
  const startTime = Bun.nanoseconds();

  try {
    // Fast filtering with checks
    if (
      EXCLUDED_USERS.has(message.author.id) ||
      message.author.bot ||
      !message.guild ||
      globalRateLimit.isActive ||
      shardState.rateLimited
    ) {
      return;
    }

    // Get guild settings and cache with error handling
    const settings = await getGuildSettings(message.guild).catch((error) => {
      logger.error("Failed to get guild settings:", error);
      return null;
    });

    if (!settings) return;

    const cache = await getCache(message.guild, settings).catch((error) => {
      logger.error("Failed to get cache:", error);
      return null;
    });

    if (!cache?.settings?.smokemon_enabled) return;

    // parallel processing with error boundaries
    const tasks = [
      checkExpGain(message.author, message.guild, undefined).catch((error) => {
        logger.error("Exp gain check failed:", error);
      }),
      checkSpawn(message as any, cache).catch(
        (error) => {
          logger.error("Spawn check failed:", error);
        }
      ),
    ];

    await Promise.allSettled(tasks);

    // Update metrics and health
    messagesProcessed++;
    shardState.lastActivity = Date.now();
    if (shardState.healthScore < 100) {
      shardState.healthScore = Math.min(100, shardState.healthScore + 0.1);
    }

    // Performance monitoring
    if (config.isDev) {
      const duration = Number(Bun.nanoseconds() - startTime) / 1_000_000;
      if (duration > CONSTANTS.SLOW_MESSAGE_THRESHOLD) {
        logger.warn(`Slow message processing: ${duration.toFixed(2)}ms`);
      }
    }
  } catch (error) {
    logger.error("Message processing error:", error);
    shardState.errors++;
    shardState.healthScore = Math.max(0, shardState.healthScore - 1);
  }
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

/**
 * Register commands for new guild with error handling
 */
async function registerGuildCommands(guild: Guild): Promise<void> {
  try {
    const token = config.isDev
      ? process.env.DISCORD_TOKEN_DEV
      : process.env.DISCORD_TOKEN;
    const clientId = config.isDev
      ? process.env.API_CLIENT_ID_DEV
      : process.env.API_CLIENT_ID;

    if (!token || !clientId) {
      logger.error("Missing token or client ID for command registration");
      return;
    }

    const rest = new REST({ version: "10", timeout: 15000 }).setToken(token);

    await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
      body: slashCommands,
    });

    shardState.guildsReady.add(guild.id);
    logger.info(
      `✅ Registered ${slashCommands.length} commands for '${guild.name}' (${guild.memberCount} members)`
    );

    // Report guild addition
    const currentShardId = config.actualShardId >= 0 ? config.actualShardId : config.shardId;
    sendToManager("guildAdd", {
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount,
      shardId: currentShardId,
    });
  } catch (error) {
    logger.error(`Command registration failed for ${guild.name}:`, error);
    shardState.errors++;
  }
}

// ============================================================================
// RATE LIMIT HANDLING
// ============================================================================

/**
 * rate limit handling with inter-shard coordination
 */
function handleRateLimit(rateLimitData: any): void {
  const minutes = Math.round(rateLimitData.timeToReset / 60000);
  logger.warn(
    `⚠️  Rate limited for ${minutes}m on route: ${rateLimitData.route || "unknown"
    }`
  );

  // Update global state
  globalRateLimit.isActive = true;
  globalRateLimit.endTime = Date.now() + rateLimitData.timeToReset;
  globalRateLimit.route = rateLimitData.route;
  globalRateLimit.retryAfter = rateLimitData.timeToReset;

  shardState.rateLimited = true;
  rateLimited = true;
  shardState.healthScore = Math.max(0, shardState.healthScore - 20);

  // Notify manager and other shards
  sendToManager("rateLimit", globalRateLimit);
  sendInterShardMessage("rateLimitSync", globalRateLimit);

  updatePresence(); // Show idle status

  // Schedule reset
  setTimeout(() => {
    globalRateLimit.isActive = false;
    globalRateLimit.endTime = 0;
    globalRateLimit.route = undefined;
    globalRateLimit.retryAfter = undefined;

    shardState.rateLimited = false;
    rateLimited = false;
    shardState.healthScore = Math.min(100, shardState.healthScore + 10);

    sendToManager("rateLimitEnd", {});
    sendInterShardMessage("rateLimitSync", globalRateLimit);
    updatePresence(); // Reset status

    logger.info("✅ Rate limit ended");
  }, rateLimitData.timeToReset);
}

// ============================================================================
// HEALTH AND UTILITY FUNCTIONS
// ============================================================================

/**
 * health check with multiple criteria
 */
function isHealthy(): boolean {
  const now = Date.now();
  const conditions = [
    !shardState.initializing,
    !shardState.rateLimited,
    now - shardState.lastActivity < CONSTANTS.ACTIVITY_TIMEOUT,
    discordClient.isReady(),
    shardState.reconnectAttempts < config.maxReconnectAttempts,
    shardState.healthScore > CONSTANTS.MIN_HEALTH_SCORE,
    shardState.errors < CONSTANTS.MAX_ERRORS_THRESHOLD,
  ];

  const healthyConditions = conditions.filter(Boolean).length;
  const healthPercentage = (healthyConditions / conditions.length) * 100;

  // Update health score based on conditions
  shardState.healthScore = Math.max(0, Math.min(100, healthPercentage));

  return healthyConditions >= CONSTANTS.MIN_HEALTHY_CONDITIONS;
}

/**
 * Dispose of all resources and intervals to prevent memory leaks
 */
function dispose(): void {
  // Clear all intervals
  if (intervals.presenceUpdate) {
    clearInterval(intervals.presenceUpdate);
    intervals.presenceUpdate = undefined;
  }
  if (intervals.statsReport) {
    clearInterval(intervals.statsReport);
    intervals.statsReport = undefined;
  }
  if (intervals.heartbeat) {
    clearInterval(intervals.heartbeat);
    intervals.heartbeat = undefined;
  }
  if (intervals.eventLoopMonitor) {
    clearInterval(intervals.eventLoopMonitor);
    intervals.eventLoopMonitor = undefined;
  }
  if (intervals.memoryMonitor) {
    clearInterval(intervals.memoryMonitor);
    intervals.memoryMonitor = undefined;
  }
  if (intervals.gcMonitor) {
    clearInterval(intervals.gcMonitor);
    intervals.gcMonitor = undefined;
  }

  // Clear processed interactions
  processedInteractions.clear();

  // Clear event loop lag history
  eventLoopLagHistory.length = 0;
  
  // Reset message ID counter
  messageIdCounter = 0;
  
  // Clear cached shard ID to force recalculation
  cachedShardId = null;

  // Dispose emote queue intervals and resources
  disposeEmoteQueue();

  logger.info("✅ Bot resources disposed");
}

/**
 * graceful shutdown with cleanup
 */
async function shutdown(): Promise<void> {
  logger.info(`🛑 Shard ${config.shardId}: Initiating shutdown...`);

  try {
    // Dispose of all resources
    dispose();

    // Notify other shards of shutdown
    await sendInterShardMessage("shardShutdown", {
      shardId: config.shardId,
      reason: "graceful_shutdown",
    });

    // Close communication manager
    if (communicationManager) {
      await communicationManager.close();
      logger.info("✅ Communication manager closed");
    }

    // Wait for any pending operations
    await new Promise((resolve) => setTimeout(resolve, CONSTANTS.SHUTDOWN_GRACE_PERIOD));

    // Destroy Discord client
    await discordClient.destroy();
    logger.info("✅ Discord client destroyed");

    process.exit(0);
  } catch (error) {
    logger.error("Shutdown error:", error);
    process.exit(1);
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

discordClient.on("clientReady", async () => {
  try {
    // Update with actual shard ID assigned by Discord.js
    const actualShardId = discordClient.shard?.ids[0] ?? 0;
    const wasTemporary = config.actualShardId === -1;

    config.actualShardId = actualShardId;
    config.shardId = actualShardId; // Update the main config
    IS_COORDINATOR = actualShardId === 0;
    // Update cached shard ID
    updateCachedShardId(actualShardId);

    // Update totalShards with actual value from Discord.js
    if (discordClient.shard?.count) {
      config.totalShards = discordClient.shard.count;
    }

    logger.info(`🎉 Discord client ready as ${discordClient.user?.tag}`);
    logger.info(`📊 Connected to ${discordClient.guilds.cache.size} guilds`);
    logger.info(`🔧 Shard ${config.shardId}/${config.totalShards}${wasTemporary ? ' (ID updated from temporary)' : ''}`);
    logger.info(`👑 Role: ${IS_COORDINATOR ? 'Coordinator' : 'Worker'}`);
    // For same-server deployment, we don't need Redis/WebSocket communication
    // All inter-shard communication goes through the manager process
    // Only initialize cross-server communication if explicitly configured for multi-server deployment
    const needsCrossServerComm = config.forceCrossServerComm;

    if (IS_COORDINATOR && needsCrossServerComm) {
      try {
        if (config.useRedis) {
          communicationManager = createRedisManager(config.redisUrl);
        } else if (config.useWebSocket) {
          communicationManager = createWebSocketClientManager(config.wsManagerUrl, config.shardId);
        }

        if (communicationManager) {
          await communicationManager.initialize();
          communicationManager.subscribe((message) => {
            handleInterShardMessage(message).catch(error => {
              logger.error('Error handling cross-server message:', error);
            });
          });
          logger.info("✅ Cross-server communication initialized");
        }
      } catch (error) {
        logger.warn("⚠️ Cross-server communication failed to initialize, falling back to single-server mode");
        logger.info("💡 Bot will function normally with same-server communication only");
        communicationManager = undefined;
      }
    } else {
      logger.info("🔗 Using same-server communication through manager process");
    }

    // Load commands
    await loadCommands();
    logger.info(`📝 Loaded ${commands.size} commands`);

    // Global slash command registration (coordinator only)
    if (IS_COORDINATOR && loaded_commands == false) {
      logger.info("👑 Coordinator role confirmed - will handle global command registration");
      setTimeout(async () => {
        try {
          if (loaded_commands == true) return;
          await registerSlashCommands();
          logger.info("✅ Global commands registered");

          // Notify other shards that global commands are ready
          await sendInterShardMessage("globalCommandsReady", {
            timestamp: Date.now(),
          });
          loaded_commands = true;
        } catch (error) {
          logger.error("❌ Global command registration failed:", error);
        }
      }, CONSTANTS.GLOBAL_COMMAND_DELAY);

      // Coordinator-specific presence updates
      intervals.presenceUpdate = setInterval(() => {
        updatePresence();
      }, config.presenceUpdateInterval);

      logger.info("👑 Coordinator role active - managing presence updates");
    }

    // Start periodic reporting
    intervals.statsReport = setInterval(reportStats, config.statsReportInterval);
    intervals.heartbeat = setInterval(sendHeartbeat, config.heartbeatInterval);

    // Performance monitoring interval
    intervals.eventLoopMonitor = setInterval(async () => {
      await measureEventLoopLag();
    }, CONSTANTS.EVENT_LOOP_CHECK_INTERVAL);

    // Update state
    shardState.initializing = false;
    initializing = false;
    shardState.healthScore = 100;
    shardState.lastActivity = Date.now();

    // Initial stats report
    setTimeout(reportStats, CONSTANTS.STATS_INITIAL_DELAY);

    // Notify manager of readiness with actual shard ID
    sendToManager("ready", {
      shardId: config.shardId,
      guilds: discordClient.guilds.cache.size,
      users: discordClient.users.cache.size,
      actualShardId: config.actualShardId,
      isCoordinator: IS_COORDINATOR,
    });

    // Send inter-shard ready message with actual shard ID
    await sendInterShardMessage("ready", {

      shardId: config.shardId,
      guilds: discordClient.guilds.cache.size,
      users: discordClient.users.cache.size,
      timestamp: Date.now(),
    });

    logger.info(`✅ Shard ${config.shardId} fully initialized and ready`);
  } catch (error) {
    logger.error("❌ Ready event error:", error);
    shardState.initializing = false;
    initializing = false;
    shardState.errors++;
  }
});

// Track processed interactions with time-based expiry to prevent duplicates
const processedInteractions = new Map<string, number>();

discordClient.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    // Create a unique identifier for this interaction
    const interactionId = `${interaction.id}-${interaction.commandName}-${interaction.user.id}`;
    const now = Date.now();

    // Check if we've already processed this interaction recently
    const lastProcessed = processedInteractions.get(interactionId);
    if (lastProcessed && (now - lastProcessed) < CONSTANTS.PROCESSED_INTERACTIONS_EXPIRY) {
      if (config.isDev) {
        logger.warn(`[Shard ${config.actualShardId}] Duplicate interaction detected and ignored: ${interaction.commandName} from ${interaction.user.username}`);
      }
      return;
    }

    // Mark this interaction as being processed with timestamp
    processedInteractions.set(interactionId, now);

    // Clean up expired entries periodically
    if (processedInteractions.size > CONSTANTS.PROCESSED_INTERACTIONS_LIMIT) {
      const expiredIds: string[] = [];
      processedInteractions.forEach((timestamp, id) => {
        if (now - timestamp > CONSTANTS.PROCESSED_INTERACTIONS_EXPIRY) {
          expiredIds.push(id);
        }
      });
      expiredIds.forEach(id => processedInteractions.delete(id));

      // If still too large, keep only the most recent ones
      if (processedInteractions.size > CONSTANTS.PROCESSED_INTERACTIONS_LIMIT) {
        const entries = Array.from(processedInteractions.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, CONSTANTS.PROCESSED_INTERACTIONS_KEEP);
        processedInteractions.clear();
        entries.forEach(([id, timestamp]) => processedInteractions.set(id, timestamp));
      }
    }

    try {
      await executeCommand(interaction);
    } catch (error) {
      logger.error(`Error executing command ${interaction.commandName}:`, error);
      // Remove from processed map if execution failed
      processedInteractions.delete(interactionId);
    }
  }
});

discordClient.on("messageCreate", processMessage);

discordClient.on("guildCreate", async (guild: Guild) => {
  logger.info(`➕ Guild added: ${guild.name} (${guild.memberCount} members)`);
  await registerGuildCommands(guild);

  // Notify other shards of new guild with comprehensive data
  await sendInterShardMessage("guildJoined", {
    guildId: guild.id,
    guildName: guild.name,
    memberCount: guild.memberCount,
    shardId: getCurrentShardId(),
    joinedAt: guild.joinedTimestamp || Date.now(),
    channelCount: guild.channels.cache.size,
    roleCount: guild.roles.cache.size,
  });
});

discordClient.on("guildDelete", async (guild: Guild) => {
  logger.info(`➖ Guild removed: ${guild.name}`);
  shardState.guildsReady.delete(guild.id);

  // Notify other shards of guild removal with comprehensive data
  await sendInterShardMessage("guildLeft", {
    guildId: guild.id,
    guildName: guild.name,
    shardId: getCurrentShardId(),
    leftAt: Date.now(),
    wasActiveGuild: shardState.guildsReady.has(guild.id),
  });

  sendToManager("guildRemove", {
    guildId: guild.id,
    guildName: guild.name,
    shardId: getCurrentShardId(),
  });
});

// rate limit handling
discordClient.rest.on("rateLimited", handleRateLimit);

// error handlers with better logging and recovery
discordClient.on("shardError", (error, shardId) => {
  logger.error(`💥 Shard ${shardId} error:`, error);
  shardState.reconnectAttempts++;
  shardState.errors++;
  shardState.healthScore = Math.max(0, shardState.healthScore - 20);

  sendToManager("shardError", {
    shardId,
    error: error.message,
    stack: error.stack,
  });
});

discordClient.on("shardReady", (shardId: number) => {
  logger.info(`✅ Shard ${shardId}: Connected and ready`);
  shardState.reconnectAttempts = 0;
  shardState.healthScore = Math.min(100, shardState.healthScore + 20);

  sendToManager("shardReady", { shardId });
});

discordClient.on("shardReconnecting", (shardId: number) => {
  logger.warn(`🔄 Shard ${shardId}: Reconnecting...`);
  shardState.reconnectAttempts++;

  sendToManager("shardReconnecting", { shardId });
});

discordClient.on("shardDisconnect", (event, shardId) => {
  logger.warn(`🔌 Shard ${shardId}: Disconnected`, event);
  shardState.healthScore = Math.max(0, shardState.healthScore - 10);

  sendToManager("shardDisconnect", { shardId, event });
});

discordClient.on("shardResume", (shardId, replayedEvents) => {
  logger.info(
    `▶️  Shard ${shardId}: Resumed (${replayedEvents} events replayed)`
  );
  shardState.healthScore = Math.min(100, shardState.healthScore + 10);

  sendToManager("shardResume", { shardId, replayedEvents });
});

// General error handlers
discordClient.on("error", (error) => {
  logger.error("❌ Client error:", error);
  shardState.errors++;
  shardState.healthScore = Math.max(0, shardState.healthScore - 5);
});

discordClient.on("warn", (warning) => {
  logger.warn("⚠️  Client warning:", warning);
});

// Debug events (only in development)
if (config.isDev) {
  discordClient.on("debug", (info) => {
    if (info.includes("heartbeat")) return; // Skip noisy heartbeat logs
    logger.debug("🐛 Debug:", info);
  });
}

// ============================================================================
// PROCESS HANDLERS
// ============================================================================

// Handle messages from shard manager (enhanced)
process.on("message", async (message: any) => {
  try {
    switch (message.type) {
      case "presenceUpdate":
        updatePresence(message.data);
        break;

      case "shutdown":
        await shutdown();
        break;

      case "restart":
        logger.info("Received restart command from manager");
        await shutdown();
        break;

      case "rateLimitUpdate":
        Object.assign(globalRateLimit, message.data);
        shardState.rateLimited = globalRateLimit.isActive;
        rateLimited = globalRateLimit.isActive;
        break;

      case "inter-shard":
        handleInterShardMessage(message.data).catch(error => {
          logger.error('Error handling inter-shard message:', error);
        });
        break;

      case "healthCheck":
        const health = await getDetailedHealth();
        sendToManager("healthResponse", health);
        break;

      case "statsRequest":
        await reportStats();
        break;

      default:
        // Only log if message has a type to avoid noise from Discord.js internal messages
        if (message.type) {
          logger.debug(`Unknown message from manager: ${message.type}`);
        }
    }
  } catch (error) {
    logger.error("Message handling error:", error);
    shardState.errors++;
  }
});

// signal handlers
const handleShutdownSignal = async (signal: string) => {
  logger.info(`📨 Received ${signal}, shutting down gracefully...`);
  await shutdown();
};

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));

// error handlers
process.on("unhandledRejection", (reason, promise) => {
  logger.error("💥 Unhandled promise rejection:", reason);
  logger.error("Promise:", promise);
  shardState.errors++;

  sendToManager("unhandledRejection", {
    reason: reason?.toString(),
    shardId: config.shardId,
  });

  // In production, consider restarting on unhandled rejections
  if (!config.isDev) {
    logger.error("🚨 Unhandled rejection in production, exiting...");
    process.exit(1);
  }
});

process.on("uncaughtException", (error) => {
  logger.error("💥 Uncaught exception:", error);
  logger.error("Stack trace:", error.stack);

  sendToManager("uncaughtException", {
    error: error.message,
    stack: error.stack,
    shardId: config.shardId,
  });

  // Always exit on uncaught exceptions
  process.exit(1);
});

// Memory usage monitoring
intervals.memoryMonitor = setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);

  // Log if memory usage is high
  if (heapUsedMB > CONSTANTS.HIGH_MEMORY_WARNING) {
    logger.warn(`🧠 High memory usage: ${heapUsedMB}MB`);
  }

  // Emergency shutdown if memory usage is critical
  if (heapUsedMB > CONSTANTS.CRITICAL_MEMORY_SHUTDOWN) {
    logger.error(`🚨 Critical memory usage: ${heapUsedMB}MB, restarting...`);
    sendToManager("emergency", {
      reason: "high_memory_usage",
      memoryUsage: heapUsedMB,
      shardId: config.shardId,
    });
    process.exit(1);
  }
}, CONSTANTS.MEMORY_CHECK_INTERVAL);

// ============================================================================
// EXPORTS AND UTILITIES
// ============================================================================

/**
 * Get comprehensive shard statistics
 */
export function getShardStats() {
  return {
    shardId: getCurrentShardId(),
    actualShardId: config.actualShardId,
    totalShards: config.totalShards,
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
    errors: shardState.errors,
    reconnectAttempts: shardState.reconnectAttempts,
    communicationConnected: shardState.communicationConnected,
    eventLoopLag: getAverageEventLoopLag(),
    startTime: shardState.startTime,
  };
}

/**
 * Get bot statistics with detailed metrics
 */
export async function getBotStats() {
  const metrics = await getShardMetrics();
  const health = await getDetailedHealth();

  return {
    ...getShardStats(),
    detailedMetrics: metrics,
    detailedHealth: health,
    config: {
      isDev: config.isDev,
      useRedis: config.useRedis,
      useWebSocket: config.useWebSocket,
      communicationEnabled: !!communicationManager,
    },
  };
}

// Backward compatibility and exports
export const getBotStatsLegacy = getShardStats; // Legacy compatibility
export const isShardHealthy = isHealthy;
export const emergencyShutdown = shutdown;
export const sendInterShardMsg = sendInterShardMessage;

// communication exports
export { communicationManager, handleInterShardMessage, sendInterShardMessage };

// Configuration export
  export { config as shardConfig };

/**
 * startup function optimized for Bun
 */
async function startBot(): Promise<void> {
  try {
    const token = config.isDev
      ? process.env.DISCORD_TOKEN_DEV
      : process.env.DISCORD_TOKEN;

    if (!token) {
      throw new Error(
        `Missing token: ${config.isDev ? "DISCORD_TOKEN_DEV" : "DISCORD_TOKEN"}`
      );
    }

    // startup logging
    logger.info(
      `🚀 Starting SmokeyBot Shard ${config.shardId}/${config.totalShards || '?'}`
    );
    logger.info(`🔧 Runtime: Bun ${Bun.version}`);
    logger.info(
      `🌍 Environment: ${config.isDev ? "Development" : "Production"}`
    );
    logger.info(`👑 Role: ${IS_COORDINATOR ? "Coordinator" : "Worker"}`);
    logger.info(
      `📡 Communication: ${config.forceCrossServerComm
        ? (config.useRedis ? `Cross-server Redis (${config.redisUrl})`
          : config.useWebSocket ? `Cross-server WebSocket (${config.wsManagerUrl})`
            : "Cross-server Direct")
        : "Same-server Direct"}`
    );
    logger.info(`💾 Message Cache Limit: ${config.messageMemoryLimit}`);
    logger.info(`⏱️  Global Cooldown: ${config.globalCooldown}s`);

    // Login to Discord
    await discordClient.login(token);
  } catch (error) {
    logger.error("💥 Startup failed:", error);

    // Send failure notification to manager
    sendToManager("startupFailed", {
      error: error instanceof Error ? error.message : String(error),
      shardId: config.shardId,
    });

    process.exit(1);
  }
}

// Additional memory optimization: Periodic manual cleanup
if (typeof process !== 'undefined') {
  logger.debug('Setting Garbage Collector timer..')
  intervals.gcMonitor = setInterval(() => {
    // Force garbage collection if available (Bun supports this)
    if (Bun.gc) {
      logger.trace('Forcing a garbage collection.');
      Bun.gc();
    }
    
    // Clean up processed interactions map periodically
    const now = Date.now();
    let cleanedCount = 0;
    for (const [id, timestamp] of processedInteractions) {
      if (now - timestamp > CONSTANTS.PROCESSED_INTERACTIONS_EXPIRY) {
        processedInteractions.delete(id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.trace(`Cleaned ${cleanedCount} expired interaction records`);
    }
    
    // Log memory usage for monitoring
    const memUsage = heapStats();
    if (memUsage.heapSize > CONSTANTS.HIGH_MEMORY_WARNING * 1024 * 1024) {
      logger.warn(`High memory usage detected: ${Math.round(memUsage.heapSize / 1024 / 1024)}MB`);
    }
  }, CONSTANTS.GC_INTERVAL);
}

// Start the bot
startBot().catch((error) => {
  logger.error("💥 Critical startup error:", error);
  process.exit(1);
});

export default discordClient;
