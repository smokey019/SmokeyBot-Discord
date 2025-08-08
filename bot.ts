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
const TWITTER_USER = "90514165138989056";

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
  private currentUrl?: string;

  async initialize(): Promise<void> {
    return this.tryConnectWithFallback(config.wsManagerUrl);
  }

  private async tryConnectWithFallback(baseUrl: string, attemptedPorts: number[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `${baseUrl}?shardId=${config.shardId}`;
        this.currentUrl = url;

        // Clean up previous WebSocket if exists
        if (this.ws) {
          this.ws.removeAllListeners();
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
          }
        }

        this.ws = new WebSocket(url);
        const currentPort = parseInt(baseUrl.split(':').pop() || '8081');
        attemptedPorts.push(currentPort);

        this.ws.on("open", () => {
          this.connected = true;
          shardState.communicationConnected = true;
          logger.info(`✅ WebSocket communication connected to ${baseUrl}`);
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

        this.ws.on("close", (code, reason) => {
          this.connected = false;
          shardState.communicationConnected = false;
          logger.warn(`WebSocket disconnected (code: ${code}, reason: ${reason || 'unknown'}), attempting reconnect...`);
          this.scheduleReconnect();
        });

        this.ws.on("error", (error) => {
          // Extract more useful error information
          const errorDetails = {
            message: error.message || 'Unknown error',
            code: (error as any).code || 'No code',
            errno: (error as any).errno || 'No errno',
            port: currentPort,
            type: error.constructor.name
          };

          logger.error(`WebSocket error details:`, errorDetails);

          if (!this.connected && config.isDev) {
            // Try fallback ports in development (max 5 attempts)
            const fallbackPorts = [8082, 8083, 8084, 8085, 8086].filter(p => !attemptedPorts.includes(p));

            if (fallbackPorts.length > 0 && attemptedPorts.length < 5) {
              const nextPort = fallbackPorts[0];
              const fallbackUrl = baseUrl.replace(/:\d+$/, `:${nextPort}`);
              logger.warn(`⚠️ WebSocket connection failed on port ${currentPort}, trying fallback port ${nextPort} (attempt ${attemptedPorts.length + 1}/5)`);

              // Clean up current WebSocket before trying next
              if (this.ws) {
                this.ws.removeAllListeners();
              }

              setTimeout(() => {
                this.tryConnectWithFallback(fallbackUrl, attemptedPorts).then(resolve).catch(reject);
              }, 1000); // Add small delay between attempts
              return;
            } else {
              logger.error(`❌ All fallback ports exhausted. Attempted ports: ${attemptedPorts.join(', ')}`);
              logger.info(`💡 For local development, you can disable WebSocket with USE_WEBSOCKET=false in your environment`);
            }
          }

          if (!this.connected) {
            reject(error);
          }
        });
      } catch (error) {
        logger.error(`Failed to create WebSocket connection:`, error);
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

    // Member & User caches - critical for memory usage
    GuildMemberManager: {
      maxSize: 25, // Reduced from 25
      keepOverLimit: (member) => {
        // Keep bot itself and any privileged users
        return member.id === member.client.user.id ||
          member.permissions?.has('Administrator') ||
          member.permissions?.has('ManageGuild');
      },
    },
    UserManager: {
      maxSize: 25, // Reduced from 25
      keepOverLimit: (user) => user.id === user.client.user.id,
    },

    // Message caching - biggest memory consumer
    MessageManager: Math.min(config.messageMemoryLimit || 10, 10), // Cap at 10

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
    compress: true, // Enable compression to reduce memory usage
    properties: {
      browser: 'Discord.js/Bun', // Identify as Bun runtime
    },
  },
});

// ============================================================================
// COMMUNICATION SYSTEM
// ============================================================================

/**
 * Get the current shard ID with proper fallback logic
 */
function getCurrentShardId(): number {
  if (config.actualShardId >= 0) {
    return config.actualShardId;
  }
  // In development with single shard, always use 0
  if (config.isDev && config.totalShards === 1) {
    return 0;
  }
  return config.shardId >= 0 ? config.shardId : 0;
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
    id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
  };

  // Skip sending if it's a single shard and message is to self
  if (config.totalShards === 1 && (toShard === currentShardId || toShard === "all")) {
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
  logger.debug(`Received inter-shard message: ${message.type}`);

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

    case "guildStatsResponse":
      handleGuildStatsResponse(message.data);
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
  // Only respond if fromShard is valid
  if (message.fromShard !== undefined && message.fromShard >= 0) {
    await sendInterShardMessage("guildStatsResponse", {
      shardId: currentShardId,
      guilds: guildStats,
      requestId: message.data.requestId
    }, message.fromShard);
  }
}

/**
 * Handle guild stats responses from other shards
 */
function handleGuildStatsResponse(data: any): void {
  logger.debug(`Received guild stats from shard ${data.shardId}: ${data.guilds.length} guilds`);
  // Emit event for external listeners (like web dashboard)
  if (typeof process !== 'undefined' && process.send) {
    sendToManager("guildStatsReceived", data);
  }
}

/**
 * Get detailed guild information for this shard
 */
async function getGuildShardStats(): Promise<GuildShardInfo[]> {
  const guilds: GuildShardInfo[] = [];
  const currentShardId = config.actualShardId >= 0 ? config.actualShardId : config.shardId;

  for (const [guildId, guild] of discordClient.guilds.cache) {
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
 * Measure event loop lag
 */
async function measureEventLoopLag(): Promise<number> {
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
 * graceful shutdown with cleanup
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
// EVENT HANDLERS
// ============================================================================

discordClient.on("ready", async () => {
  try {
    // Update with actual shard ID assigned by Discord.js
    const actualShardId = discordClient.shard?.ids[0] ?? 0;
    const wasTemporary = config.actualShardId === -1;

    config.actualShardId = actualShardId;
    config.shardId = actualShardId; // Update the main config
    IS_COORDINATOR = actualShardId === 0;

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
          communicationManager = new RedisCommunicationManager();
        } else if (config.useWebSocket) {
          communicationManager = new WebSocketCommunicationManager();
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
      }, 15000);

      // Coordinator-specific presence updates
      setInterval(() => {
        updatePresence();
      }, config.presenceUpdateInterval);

      logger.info("👑 Coordinator role active - managing presence updates");
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

// Track processed interactions to prevent duplicates
const processedInteractions = new Set<string>();

discordClient.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    // Create a unique identifier for this interaction
    const interactionId = `${interaction.id}-${interaction.commandName}-${interaction.user.id}`;

    // Check if we've already processed this interaction
    if (processedInteractions.has(interactionId)) {
      if (config.isDev) {
        logger.warn(`[Shard ${config.actualShardId}] Duplicate interaction detected and ignored: ${interaction.commandName} from ${interaction.user.username}`);
      }
      return;
    }

    // Mark this interaction as being processed
    processedInteractions.add(interactionId);

    // Clean up old interaction IDs periodically (keep last 1000)
    if (processedInteractions.size > 1000) {
      const idsArray = Array.from(processedInteractions);
      processedInteractions.clear();
      idsArray.slice(-500).forEach(id => processedInteractions.add(id));
    }

    try {
      await executeCommand(interaction);
    } catch (error) {
      logger.error(`Error executing command ${interaction.commandName}:`, error);
      // Remove from processed set if execution failed
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
        logger.debug(`Unknown message from manager: ${message.type}`);
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
      `🚀 Starting SmokeyBot Shard ${config.shardId}/${config.totalShards}`
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
        : "Same-server Direct (optimized)"}`
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
  setInterval(() => {
    // Force garbage collection if available (Bun supports this)
    if (Bun.gc) {
      logger.trace('Forcing a garbage collection.');
      Bun.gc();
    } else {
      logger.trace('No garbage collection available.');
    }
    // Log memory usage for monitoring
    const memUsage = heapStats();
    if (memUsage.heapSize > 500 * 1024 * 1024) { // 500MB threshold
      logger.warn(`High memory usage detected: ${Math.round(memUsage.heapSize / 1024 / 1024)}MB`);
    }
  }, 600000); // Every 10 minutes
}

// Start the bot
startBot().catch((error) => {
  logger.error("💥 Critical startup error:", error);
  process.exit(1);
});

export default discordClient;
