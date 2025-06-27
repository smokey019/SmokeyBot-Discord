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
import { createClient } from "redis";
import { WebSocket } from "ws";
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
let loaded_commands = false;

// Extract isDev before config to avoid temporal dead zone issues
const isDev = process.env.DEV === "true" || process.argv.includes("--dev");

// Enhanced configuration with environment validation
const config = {
  shardId: parseInt(
    process.env.SHARD_ID ||
    process.argv.find((arg) => arg.startsWith("--shard="))?.split("=")[1] ||
    "0"
  ),
  totalShards: parseInt(process.env.TOTAL_SHARDS || "1"),
  isDev,
  globalCooldown: parseInt(process.env.GLOBAL_COOLDOWN || "2"),
  presenceUpdateInterval: parseInt(
    process.env.PRESENCE_UPDATE_INTERVAL || "300000"
  ), // 5 minutes
  statsReportInterval: parseInt(process.env.STATS_REPORT_INTERVAL || "30000"), // 30 seconds
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "60000"), // 1 minute
  maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || "5"),
  // Communication settings
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  wsManagerUrl: process.env.WS_MANAGER_URL || "ws://localhost:8080",
  useRedis: process.env.USE_REDIS === "true",
  useWebSocket: process.env.USE_WEBSOCKET === "true",
  // Performance settings
  messageMemoryLimit: parseInt(
    process.env.MESSAGE_MEMORY_LIMIT || (isDev ? "50" : "20")
  ),
  sweepInterval: parseInt(process.env.SWEEP_INTERVAL || "300"),
  messageLifetime: parseInt(
    process.env.MESSAGE_LIFETIME || (isDev ? "300" : "600")
  ),
};

// Computed values
const IS_COORDINATOR = config.shardId === 0;
const EXCLUDED_USERS = new Set(["458710213122457600", "758820204133613598"]);
const TWITTER_USER = "90514165138989056";

// Enhanced bot activities
const ACTIVITIES = [
  { name: "with Pokémon", type: ActivityType.Playing },
  { name: "trainers catch Pokémon", type: ActivityType.Watching },
  { name: "epic Pokémon battles", type: ActivityType.Listening },
  { name: "for shiny Pokémon", type: ActivityType.Watching },
  { name: "Pokémon evolutions", type: ActivityType.Watching },
  { name: "legendary encounters", type: ActivityType.Competing },
];

// Enhanced interfaces for better type safety
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
}

interface GlobalRateLimit {
  isActive: boolean;
  endTime: number;
  route?: string;
  retryAfter?: number;
}

interface InterShardMessage {
  type: string;
  fromShard?: number;
  toShard?: number | "all";
  data: any;
  timestamp: number;
  id: string;
}

interface CommunicationManager {
  initialize(): Promise<void>;
  send(message: InterShardMessage): Promise<void>;
  subscribe(callback: (message: InterShardMessage) => void): void;
  close(): Promise<void>;
  isConnected(): boolean;
}

// Enhanced state management
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

// Backward compatibility exports
export let rateLimited = false;
export let initializing = true;

// Redis Communication Manager
class RedisCommunicationManager implements CommunicationManager {
  private client?: ReturnType<typeof createClient>;
  private subscriber?: ReturnType<typeof createClient>;
  private callbacks: Array<(message: InterShardMessage) => void> = [];
  private connected = false;

  async initialize(): Promise<void> {
    try {
      this.client = createClient({ url: config.redisUrl });
      this.subscriber = createClient({ url: config.redisUrl });

      await this.client.connect();
      await this.subscriber.connect();

      // Subscribe to shard-specific and broadcast channels
      await this.subscriber.subscribe(`shard-${config.shardId}`, (message) => {
        this.handleMessage(message);
      });

      await this.subscriber.subscribe("shard-broadcast", (message) => {
        this.handleMessage(message);
      });

      this.connected = true;
      shardState.communicationConnected = true;
      logger.info("✅ Redis communication connected");
    } catch (error) {
      logger.error("❌ Redis connection failed:", error);
      this.connected = false;
      throw error;
    }
  }

  private handleMessage(message: string): void {
    try {
      const parsedMessage: InterShardMessage = JSON.parse(message);
      this.callbacks.forEach((callback) => callback(parsedMessage));
    } catch (error) {
      logger.error("Failed to parse Redis message:", error);
    }
  }

  async send(message: InterShardMessage): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error("Redis client not connected");
    }

    const channel =
      message.toShard === "all"
        ? "shard-broadcast"
        : `shard-${message.toShard}`;
    await this.client.publish(channel, JSON.stringify(message));
  }

  subscribe(callback: (message: InterShardMessage) => void): void {
    this.callbacks.push(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    this.connected = false;
    shardState.communicationConnected = false;
    await this.client?.disconnect();
    await this.subscriber?.disconnect();
  }
}

// WebSocket Communication Manager
class WebSocketCommunicationManager implements CommunicationManager {
  private ws?: WebSocket;
  private callbacks: Array<(message: InterShardMessage) => void> = [];
  private connected = false;
  private reconnectTimer?: Timer;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `${config.wsManagerUrl}?shardId=${config.shardId}`;
        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
          this.connected = true;
          shardState.communicationConnected = true;
          logger.info("✅ WebSocket communication connected");
          resolve();
        });

        this.ws.on("message", (data) => {
          try {
            const message: InterShardMessage = JSON.parse(data.toString());
            this.callbacks.forEach((callback) => callback(message));
          } catch (error) {
            logger.error("Failed to parse WebSocket message:", error);
          }
        });

        this.ws.on("close", () => {
          this.connected = false;
          shardState.communicationConnected = false;
          logger.warn("WebSocket disconnected, attempting reconnect...");
          this.scheduleReconnect();
        });

        this.ws.on("error", (error) => {
          logger.error("WebSocket error:", error);
          if (!this.connected) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.initialize();
      } catch (error) {
        logger.error("WebSocket reconnect failed:", error);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  async send(message: InterShardMessage): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error("WebSocket not connected");
    }

    this.ws.send(JSON.stringify(message));
  }

  subscribe(callback: (message: InterShardMessage) => void): void {
    this.callbacks.push(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    this.connected = false;
    shardState.communicationConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

// Communication manager instance
let communicationManager: CommunicationManager | undefined;

if (config.useRedis) {
  communicationManager = new RedisCommunicationManager();
} else if (config.useWebSocket) {
  communicationManager = new WebSocketCommunicationManager();
}

// Enhanced Discord client optimized for Bun
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
  // Bun-optimized cache settings
  makeCache: Options.cacheWithLimits({
    ApplicationCommandManager: 0,
    BaseGuildEmojiManager: 0,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildMemberManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    MessageManager: config.messageMemoryLimit,
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
      interval: config.sweepInterval,
      lifetime: config.messageLifetime,
    },
    users: {
      interval: config.sweepInterval,
      filter: () => (user) => user.bot && user.id !== user.client.user.id,
    },
  },
});

// ============================================================================
// ENHANCED COMMUNICATION SYSTEM
// ============================================================================

/**
 * Send message to shard manager (backward compatibility)
 */
function sendToManager(type: string, data: any): void {
  try {
    process.send?.({
      type,
      shardId: config.shardId,
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
  const message: InterShardMessage = {
    type,
    fromShard: config.shardId,
    toShard: toShard || "all",
    data,
    timestamp: Date.now(),
    id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
  };

  try {
    if (communicationManager) {
      await communicationManager.send(message);
    } else {
      // Fallback to manager communication
      sendToManager("inter-shard", message);
    }
  } catch (error) {
    logger.error("Failed to send inter-shard message:", error);
  }
}

/**
 * Handle inter-shard messages
 */
function handleInterShardMessage(message: InterShardMessage): void {
  logger.debug(`Received inter-shard message: ${message.type}`, message);

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
  await sendInterShardMessage("healthResponse", health, message.fromShard);
}

// ============================================================================
// ENHANCED METRICS AND MONITORING
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
 * Measure event loop lag
 */
function measureEventLoopLag(): Promise<number> {
  const start = Bun.nanoseconds();
  return new Promise<number>((resolve) => {
    setImmediate(() => {
      const lag = Number(Bun.nanoseconds() - start) / 1_000_000; // Convert to ms
      eventLoopLagHistory.push(lag);
      if (eventLoopLagHistory.length > 10) {
        eventLoopLagHistory.shift();
      }
      resolve(lag);
    });
  }).then((lag) => lag);
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
  };
}

/**
 * Get detailed health information
 */
async function getDetailedHealth(): Promise<any> {
  const metrics = await getShardMetrics();

  return {
    shardId: config.shardId,
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
 * Enhanced stats reporting
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
 * Send heartbeat with enhanced data
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
// ENHANCED PRESENCE MANAGEMENT
// ============================================================================

/**
 * Enhanced presence updates with activity rotation
 */
function updatePresence(activity?: any): void {
  try {
    const selectedActivity =
      activity ||
      (IS_COORDINATOR
        ? ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)]
        : ACTIVITIES[0]);

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
 * Enhanced command execution with comprehensive error handling
 */
async function executeCommand(interaction: CommandInteraction): Promise<void> {
  const startTime = Bun.nanoseconds();

  try {
    if (!interaction.guild) return;

    // Enhanced cooldown and rate limit checks
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

    // Parallel settings and cache fetch
    const [settings, cache] = await Promise.all([
      getGuildSettings(interaction.guild),
      getGuildSettings(interaction.guild).then((s) =>
        getCache(interaction.guild, s)
      ),
    ]);

    if (!settings || !cache) {
      await queueMessage(
        "Configuration error. Please try again later.",
        interaction,
        false
      );
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
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Command timeout")), 30000)
    );

    await Promise.race([commandPromise, timeoutPromise]);

    // Update metrics and state
    commandsExecuted++;
    shardState.lastActivity = Date.now();
    shardState.healthScore = Math.min(100, shardState.healthScore + 1);

    // Performance monitoring
    if (config.isDev) {
      const duration = Number(Bun.nanoseconds() - startTime) / 1_000_000;
      if (duration > 1000) {
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
// ENHANCED MESSAGE PROCESSING
// ============================================================================

/**
 * High-performance message processing with comprehensive error handling
 */
async function processMessage(message: Message): Promise<void> {
  const startTime = Bun.nanoseconds();

  try {
    // Fast filtering with enhanced checks
    if (
      EXCLUDED_USERS.has(message.author.id) ||
      message.author.bot ||
      !message.guild ||
      globalRateLimit.isActive ||
      shardState.rateLimited
    ) {
      return;
    }

    // Parallel settings fetch with error handling
    const [settings, cache] = await Promise.all([
      getGuildSettings(message.guild).catch((error) => {
        logger.error("Failed to get guild settings:", error);
        return null;
      }),
      getGuildSettings(message.guild)
        .then((s) => getCache(message.guild, s))
        .catch((error) => {
          logger.error("Failed to get cache:", error);
          return null;
        }),
    ]);

    if (!cache?.settings?.smokemon_enabled) return;

    // Enhanced parallel processing with error boundaries
    const tasks = [
      checkExpGain(message.author, message.guild, undefined).catch((error) => {
        logger.error("Exp gain check failed:", error);
      }),
      checkSpawn(message as unknown as CommandInteraction, cache).catch(
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
      if (duration > 500) {
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
// ENHANCED COMMAND REGISTRATION
// ============================================================================

/**
 * Register commands for new guild with enhanced error handling
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
    sendToManager("guildAdd", {
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount,
    });
  } catch (error) {
    logger.error(`Command registration failed for ${guild.name}:`, error);
    shardState.errors++;
  }
}

// ============================================================================
// ENHANCED RATE LIMIT HANDLING
// ============================================================================

/**
 * Enhanced rate limit handling with inter-shard coordination
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
// ENHANCED HEALTH AND UTILITY FUNCTIONS
// ============================================================================

/**
 * Enhanced health check with multiple criteria
 */
function isHealthy(): boolean {
  const now = Date.now();
  const conditions = [
    !shardState.initializing,
    !shardState.rateLimited,
    now - shardState.lastActivity < 300000, // 5 minutes
    discordClient.isReady(),
    shardState.reconnectAttempts < config.maxReconnectAttempts,
    shardState.healthScore > 20,
    shardState.errors < 50,
  ];

  const healthyConditions = conditions.filter(Boolean).length;
  const healthPercentage = (healthyConditions / conditions.length) * 100;

  // Update health score based on conditions
  shardState.healthScore = Math.max(0, Math.min(100, healthPercentage));

  return healthyConditions >= 5; // At least 5/7 conditions must be met
}

/**
 * Enhanced graceful shutdown with cleanup
 */
async function shutdown(): Promise<void> {
  logger.info(`🛑 Shard ${config.shardId}: Initiating shutdown...`);

  try {
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
    await new Promise((resolve) => setTimeout(resolve, 2000));

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
// ENHANCED EVENT HANDLERS
// ============================================================================

discordClient.on("ready", async () => {
  try {
    logger.info(`🎉 Discord client ready as ${discordClient.user?.tag}`);
    logger.info(`📊 Connected to ${discordClient.guilds.cache.size} guilds`);
    logger.info(`🔧 Shard ${config.shardId}/${config.totalShards}`);

    // Initialize communication manager
    if (communicationManager) {
      try {
        await communicationManager.initialize();
        communicationManager.subscribe(handleInterShardMessage);
        logger.info("✅ Inter-shard communication initialized");
      } catch (error) {
        logger.error("❌ Failed to initialize communication:", error);
      }
    }

    // Load commands
    await loadCommands();
    logger.info(`📝 Loaded ${commands.size} commands`);

    // Global slash command registration (coordinator only)
    if (IS_COORDINATOR && loaded_commands == false) {
      setTimeout(async () => {
        try {
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
      }, 15000);

      // Coordinator-specific presence updates
      setInterval(() => {
        updatePresence();
      }, config.presenceUpdateInterval);

      logger.info("👑 Coordinator role active");
    }

    // Start periodic reporting
    setInterval(reportStats, config.statsReportInterval);
    setInterval(sendHeartbeat, config.heartbeatInterval);

    // Performance monitoring interval
    setInterval(async () => {
      await measureEventLoopLag();
    }, 10000); // Every 10 seconds

    // Update state
    shardState.initializing = false;
    initializing = false;
    shardState.healthScore = 100;
    shardState.lastActivity = Date.now();

    // Initial stats report
    setTimeout(reportStats, 5000);

    // Notify manager of readiness
    sendToManager("ready", {
      shardId: config.shardId,
      guilds: discordClient.guilds.cache.size,
      users: discordClient.users.cache.size,
    });

    logger.info(`✅ Shard ${config.shardId} fully initialized and ready`);
  } catch (error) {
    logger.error("❌ Ready event error:", error);
    shardState.initializing = false;
    initializing = false;
    shardState.errors++;
  }
});

discordClient.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    await executeCommand(interaction);
  }
});

discordClient.on("messageCreate", processMessage);

discordClient.on("guildCreate", async (guild: Guild) => {
  logger.info(`➕ Guild added: ${guild.name} (${guild.memberCount} members)`);
  await registerGuildCommands(guild);

  // Notify other shards of new guild
  await sendInterShardMessage("guildJoined", {
    guildId: guild.id,
    guildName: guild.name,
    memberCount: guild.memberCount,
    shardId: config.shardId,
  });
});

discordClient.on("guildDelete", async (guild: Guild) => {
  logger.info(`➖ Guild removed: ${guild.name}`);
  shardState.guildsReady.delete(guild.id);

  // Notify other shards of guild removal
  await sendInterShardMessage("guildLeft", {
    guildId: guild.id,
    guildName: guild.name,
    shardId: config.shardId,
  });

  sendToManager("guildRemove", {
    guildId: guild.id,
    guildName: guild.name,
  });
});

// Enhanced rate limit handling
discordClient.rest.on("rateLimited", handleRateLimit);

// Enhanced error handlers with better logging and recovery
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
// ENHANCED PROCESS HANDLERS
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
        handleInterShardMessage(message.data);
        break;

      case "healthCheck":
        const health = await getDetailedHealth();
        sendToManager("healthResponse", health);
        break;

      case "statsRequest":
        await reportStats();
        break;

      default:
        logger.debug(`Unknown message from manager: ${message.type}`);
    }
  } catch (error) {
    logger.error("Message handling error:", error);
    shardState.errors++;
  }
});

// Enhanced signal handlers
const handleShutdownSignal = async (signal: string) => {
  logger.info(`📨 Received ${signal}, shutting down gracefully...`);
  await shutdown();
};

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));

// Enhanced error handlers
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
setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);

  // Log if memory usage is high
  if (heapUsedMB > 500) {
    logger.warn(`🧠 High memory usage: ${heapUsedMB}MB`);
  }

  // Emergency shutdown if memory usage is critical
  if (heapUsedMB > 1000) {
    logger.error(`🚨 Critical memory usage: ${heapUsedMB}MB, restarting...`);
    sendToManager("emergency", {
      reason: "high_memory_usage",
      memoryUsage: heapUsedMB,
      shardId: config.shardId,
    });
    process.exit(1);
  }
}, 60000); // Check every minute

// ============================================================================
// ENHANCED EXPORTS AND UTILITIES
// ============================================================================

/**
 * Get comprehensive shard statistics
 */
export function getShardStats() {
  return {
    shardId: config.shardId,
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
 * Get enhanced bot statistics with detailed metrics
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

// Backward compatibility and enhanced exports
export const getBotStatsLegacy = getShardStats; // Legacy compatibility
export const isShardHealthy = isHealthy;
export const emergencyShutdown = shutdown;
export const sendInterShardMsg = sendInterShardMessage;

// Enhanced communication exports
export { communicationManager, handleInterShardMessage, sendInterShardMessage };

// Configuration export
export { config as shardConfig };

/**
 * Enhanced startup function optimized for Bun
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

    // Enhanced startup logging
    logger.info(
      `🚀 Starting SmokeyBot Shard ${config.shardId}/${config.totalShards}`
    );
    logger.info(`🔧 Runtime: Bun ${Bun.version}`);
    logger.info(
      `🌍 Environment: ${config.isDev ? "Development" : "Production"}`
    );
    logger.info(`👑 Role: ${IS_COORDINATOR ? "Coordinator" : "Worker"}`);
    logger.info(
      `📡 Communication: ${config.useRedis ? "Redis" : config.useWebSocket ? "WebSocket" : "Direct"
      }`
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

// Start the bot
startBot().catch((error) => {
  logger.error("💥 Critical startup error:", error);
  process.exit(1);
});

export default discordClient;
