import { Shard, ShardingManager } from "discord.js";
import { EventEmitter } from "events";
import AutoPoster from "topgg-autoposter";
import {
  createRedisManager,
  createWebSocketServerManager,
  type CommunicationManager,
  type InterShardMessage,
} from "./clients/communication";
import { getLogger } from "./clients/logger";

const logger = getLogger("ShardManager");

// Constants for better maintainability
const CONSTANTS = {
  HEARTBEAT_TIMEOUT: 120000, // 2 minutes
  UNHEALTHY_THRESHOLD: 300000, // 5 minutes
  ERROR_THRESHOLD: 10,
  BASE_RESTART_DELAY: 5000,
  MAX_RESTART_DELAY: 60000,
  SPAWN_DELAY: 5000,
  SHUTDOWN_GRACE_PERIOD: 5000,
  DETAILED_STATS_INTERVAL: 900000, // 15 minutes
  INITIAL_STATS_DELAY: 30000,
  GUILD_STATS_REFRESH_INTERVAL: 300000, // 5 minutes
  HEALTH_ALERT_INTERVAL: 300000, // 5 minutes
  DETAILED_STATS_LOG_MODULO: 600000, // 10 minutes
} as const;

// configuration with environment validation
const config = {
  token: process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_DEV,
  topggKey: process.env.TOPGG_KEY,
  isDev: process.env.DEV === "true",
  respawn: process.env.SHARD_RESPAWN !== "false",
  timeout: parseInt(process.env.SHARD_TIMEOUT || "30000"),
  // Developer-friendly port configuration to avoid conflicts
  redisUrl: process.env.REDIS_URL || (process.env.DEV === "true" ? "redis://localhost:6380" : "redis://localhost:6379"),
  wsPort: parseInt(process.env.WS_PORT || (process.env.DEV === "true" ? "8081" : "8080")),
  // Fallback ports for development in case primary dev port is also in use
  devFallbackPorts: [8082, 8083, 8084, 8085],
  useRedis: process.env.USE_REDIS === "true",
  useWebSocket: process.env.USE_WEBSOCKET === "true",
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "30000"),
  statsInterval: parseInt(process.env.STATS_INTERVAL || "60000"),
  maxShardRestarts: parseInt(process.env.MAX_SHARD_RESTARTS || "5"),
};

// error handling
class ShardManagerError extends Error {
  constructor(
    message: string,
    public code: string,
    public shardId?: number,
  ) {
    super(message);
    this.name = "ShardManagerError";
  }
}

// Efficient ID generator using counter + timestamp
let messageIdCounter = 0;
function generateMessageId(): string {
  return `${Date.now()}-${(messageIdCounter++).toString(36)}`;
}

// Communication interface types are now imported from shared module

interface ShardHealthMetrics {
  id: number;
  status: "ready" | "spawning" | "reconnecting" | "dead" | "disconnected";
  lastHeartbeat: number;
  restarts: number;
  uptime: number;
  guilds: number;
  users: number;
  channels: number;
  memory: NodeJS.MemoryUsage;
  errors: number;
  ping: number;
  cpu: number;
  eventLoopLag: number;
  guildDetails?: GuildShardInfo[];
}

interface GuildShardInfo {
  id: string;
  name: string;
  memberCount: number;
  shardId: number;
  joinedAt: number;
  channelCount?: number;
  roleCount?: number;
}

interface GlobalStatistics {
  totalGuilds: number;
  totalUsers: number;
  totalChannels: number;
  totalShards: number;
  healthyShards: number;
  avgPing: number;
  avgUptime: number;
  totalRestarts: number;
  totalMemoryUsage: number;
  lastUpdate: number;
  // Removed guildDistribution and largestGuilds to reduce memory usage
  // These can be fetched on-demand via broadcastEval when needed for stats display
}

// Communication manager classes are now imported from shared module
// See: clients/communication/index.ts

class EnhancedShardManager extends EventEmitter {
  public manager: ShardingManager;
  private shardHealth = new Map<number, ShardHealthMetrics>();
  private globalStats: GlobalStatistics = {
    totalGuilds: 0,
    totalUsers: 0,
    totalChannels: 0,
    totalShards: 0,
    healthyShards: 0,
    avgPing: 0,
    avgUptime: 0,
    totalRestarts: 0,
    totalMemoryUsage: 0,
    lastUpdate: Date.now(),
  };
  private healthCheckInterval?: Timer;
  private statsInterval?: Timer;
  private detailedStatsInterval?: Timer;
  private guildStatsRefreshInterval?: Timer;
  private healthAlertInterval?: Timer;
  private autoPoster?: any;
  private isShuttingDown = false;
  private communicationManager?: CommunicationManager;
  private startTime = Date.now();
  // Removed guildToShardMap - Discord.js already tracks guild.shardId

  constructor() {
    super();

    // Validate environment
    if (!config.token) {
      throw new ShardManagerError("Missing Discord token", "MISSING_TOKEN");
    }

    // Only initialize cross-server communication if explicitly enabled
    // Most deployments will use same-server communication through the manager process
    const enableCrossServer = process.env.FORCE_CROSS_SERVER_COMM === "true";

    if (enableCrossServer) {
      if (config.useRedis) {
        this.communicationManager = createRedisManager(config.redisUrl);
        logger.info("📡 Redis communication enabled for cross-server messaging");
      } else if (config.useWebSocket) {
        this.communicationManager = createWebSocketServerManager(config.wsPort, config.devFallbackPorts);
        logger.info("📡 WebSocket communication enabled for cross-server messaging");
      }
    }

    logger.info("🔗 Using optimized direct shard messaging for same-server communication");

    // Create sharding manager optimized for Bun
    this.manager = new ShardingManager("./bot.ts", {
      token: config.token,
      totalShards: config.isDev ? 1 : "auto",
      respawn: config.respawn,
      shardArgs: config.isDev ? ["--dev"] : [],
      execArgv: [],
      mode: "process", // Use process mode for better compatibility with Bun
    });

    this.setupEventHandlers();
    this.setupTopGG();
  }

  /**
   * Setup event handlers for shards
   */
  private setupEventHandlers(): void {
    this.manager.on("shardCreate", (shard) => {
      logger.info(
        `🚀 Launching shard ${shard.id}/${this.manager.totalShards}`,
      );
      this.initializeShardHealth(shard);
      this.setupShardEventHandlers(shard);
    });

    // Setup communication message handling for cross-server messages
    if (this.communicationManager) {
      this.communicationManager.subscribe((message) => {
        logger.debug(`Received cross-server message: ${message.type}`);
        this.handleInterShardMessage(message);
      });
    }
  }

  /**
   * Initialize health tracking for a shard
   */
  private initializeShardHealth(shard: Shard): void {
    this.shardHealth.set(shard.id, {
      id: shard.id,
      status: "spawning",
      lastHeartbeat: Date.now(),
      restarts: 0,
      uptime: 0,
      guilds: 0,
      users: 0,
      channels: 0,
      memory: process.memoryUsage(),
      errors: 0,
      ping: 0,
      cpu: 0,
      eventLoopLag: 0,
    });
  }

  /**
   * Update shard ID mapping when Discord.js assigns different ID
   */
  private updateShardIdMapping(oldId: number, newId: number): void {
    if (oldId === newId) return;

    logger.info(`🔄 Updating shard ID mapping: ${oldId} -> ${newId}`);

    // Move health data to new ID
    const healthData = this.shardHealth.get(oldId);
    if (healthData) {
      healthData.id = newId;
      this.shardHealth.set(newId, healthData);
      this.shardHealth.delete(oldId);
    }

    logger.info(`✅ Shard ID mapping updated successfully`);
  }

  /**
   * Setup comprehensive event handlers for individual shards
   */
  private setupShardEventHandlers(shard: Shard): void {
    const events = {
      ready: () => {
        logger.info(`✅ Shard ${shard.id} ready`);
        this.updateShardHealth(shard.id, {
          status: "ready",
          lastHeartbeat: Date.now(),
        });
      },
      death: () => {
        logger.error(`💀 Shard ${shard.id} died`);
        this.updateShardHealth(shard.id, { status: "dead" });
        this.handleShardDeath(shard);
      },
      disconnect: () => {
        logger.warn(`🔌 Shard ${shard.id} disconnected`);
        this.updateShardHealth(shard.id, { status: "disconnected" });
      },
      reconnecting: () => {
        logger.warn(`🔄 Shard ${shard.id} reconnecting`);
        this.updateShardHealth(shard.id, { status: "reconnecting" });
      },
      spawn: () => {
        logger.info(`🌱 Shard ${shard.id} spawned`);
        this.updateShardHealth(shard.id, { status: "spawning" });
      },
      message: (message: any) => {
        this.handleShardMessage(shard, message).catch(error => {
          logger.error(
            `Error handling message from shard ${shard.id}:`,
            error,
          );
        });
      },
      error: (error: Error) => {
        logger.error(`Shard ${shard.id} error:`, error);
        this.incrementShardErrors(shard.id);
      },
    };

    // Bind all events with proper typing
    Object.entries(events).forEach(([event, handler]) => {
      shard.on(event as keyof typeof events, handler);
    });
  }

  /**
   * Handle messages from shards with processing
   */
  private async handleShardMessage(shard: Shard, message: any): Promise<void> {
    const health = this.shardHealth.get(shard.id);
    if (!health) return;

    // Handle evaluation results
    if (message._eval) {
      // Skip logging eval results to reduce console noise
      return;
    }

    // message type handling
    switch (message.type) {
      case "stats":
        // Handle potential shard ID mismatch
        const statsShardId = message.data?.actualShardId !== undefined ? message.data.actualShardId : shard.id;
        this.updateShardHealth(statsShardId, {
          guilds: message.guilds || 0,
          users: message.users || 0,
          channels: message.channels || 0,
          memory: message.memory || process.memoryUsage(),
          ping: message.ping || 0,
          cpu: message.cpu || 0,
          eventLoopLag: message.eventLoopLag || 0,
          lastHeartbeat: Date.now(),
        });

        // Update shard ID mapping if it changed
        if (message.data?.actualShardId !== undefined && message.data.actualShardId !== shard.id) {
          this.updateShardIdMapping(shard.id, message.data.actualShardId);
        }
        break;

      case "heartbeat":
        this.updateShardHealth(shard.id, { lastHeartbeat: Date.now() });
        break;

      case "health":
        this.updateShardHealth(shard.id, {
          ...message.data,
          lastHeartbeat: Date.now(),
        });
        break;

      case "guildStatsReceived":
        this.handleGuildStatsReceived(message.data);
        break;

      case "ready":
        const readyData = message.data || message;
        const readyShardId = readyData.actualShardId !== undefined ? readyData.actualShardId : (readyData.shardId !== undefined ? readyData.shardId : shard.id);

        logger.info(`✅ Shard ${readyShardId} fully ready${readyData.actualShardId !== shard.id ? ` (Discord.js assigned ${readyShardId} instead of ${shard.id})` : ''}`);

        this.updateShardHealth(readyShardId, {
          status: "ready",
          lastHeartbeat: Date.now(),
          guilds: readyData.guilds || 0,
          users: readyData.users || 0,
        });

        // Update shard ID mapping if it changed
        if (readyData.actualShardId !== undefined && readyData.actualShardId !== shard.id) {
          this.updateShardIdMapping(shard.id, readyData.actualShardId);
        }

        // Log coordinator status
        if (readyData.isCoordinator) {
          logger.info(`👑 Shard ${readyShardId} is the coordinator`);
        }
        break;

      case "guildAdd":
      case "guildRemove":
        // Update guild tracking
        this.updateGuildTracking(message.type, message.data);
        break;

      case "inter-shard":
        // Handle inter-shard communication - route the message
        const interShardMessage = message.data as InterShardMessage;
        logger.debug(`Routing inter-shard message from shard ${shard.id}: ${interShardMessage.type}`);

        // Route the message to target shard(s) with validation
        if (interShardMessage.toShard === "all") {
          await this.broadcastInterShardMessage(interShardMessage);
        } else if (typeof interShardMessage.toShard === "number" && interShardMessage.toShard >= 0) {
          await this.sendInterShardMessage(interShardMessage.toShard, interShardMessage);
        } else {
          logger.warn(`Invalid toShard value: ${interShardMessage.toShard} from shard ${shard.id}`);
        }

        // Also handle it locally for manager processing
        this.handleInterShardMessage(interShardMessage);
        break;

      case "clientReady":
      case "shardReconnecting":
      case "shardDisconnect":
      case "shardResume":
      case "shardError":
        // Discord.js shard events - already logged by event handlers
        break;

      default:
        // Only log if message has a type to avoid noise from Discord.js internal messages
        if (message.type) {
          logger.debug(`Unknown message type from shard ${shard.id}: ${message.type}`);
        }
    }
  }

  /**
   * Handle inter-shard communication messages (manager processing)
   */
  private handleInterShardMessage(message: InterShardMessage): void {
    logger.debug(`Processing inter-shard message: ${message.type}`);

    // Handle specific message types that the manager needs to process
    switch (message.type) {
      case "guildJoined":
      case "guildLeft":
        // Guild tracking removed - use on-demand queries when needed
        logger.debug(`Guild ${message.type === "guildJoined" ? "joined" : "left"}: ${message.data.guildName}`);
        break;
      case "ready":
        logger.info(`Inter-shard ready notification from shard ${message.fromShard}`);
        break;
      case "guildStatsRequest":
        // Guild stats requests are handled by individual shards
        logger.debug(`Guild stats request from shard ${message.fromShard}`);
        break;
      default:
        logger.trace(`Manager doesn't need to process message type: ${message.type}`);
    }

    // Emit event for external listeners
    this.emit("interShardMessage", message);
  }

  /**
   * Send inter-shard message to specific shard
   */
  private async sendInterShardMessage(
    shardId: number,
    message: InterShardMessage,
  ): Promise<void> {
    // Additional validation to prevent invalid shard IDs
    if (shardId < 0) {
      logger.warn(`Rejecting message to invalid shard ID ${shardId}: ${message.type}`);
      return;
    }

    const shard = this.manager.shards.get(shardId);
    if (shard) {
      try {
        logger.debug(`Sending inter-shard message to shard ${shardId}: ${message.type}`);
        await shard.send({
          type: "inter-shard",
          data: message,
        });
      } catch (error) {
        logger.error(
          `Failed to send inter-shard message to shard ${shardId}:`,
          error,
        );
      }
    } else {
      logger.warn(`Cannot send message to shard ${shardId}: shard not found (available: ${Array.from(this.manager.shards.keys()).join(', ')})`);
    }
  }

  /**
   * Broadcast inter-shard message to all shards
   */
  private async broadcastInterShardMessage(
    message: InterShardMessage,
  ): Promise<void> {
    logger.debug(`Broadcasting inter-shard message: ${message.type} to ${this.manager.shards.size} shards`);

    const promises = Array.from(this.manager.shards.values()).map(
      async (shard) => {
        // Don't send the message back to the sender
        if (shard.id !== message.fromShard) {
          try {
            await shard.send({
              type: "inter-shard",
              data: message,
            });
          } catch (error) {
            logger.error(
              `Failed to broadcast inter-shard message to shard ${shard.id}:`,
              error,
            );
          }
        }
      },
    );

    await Promise.allSettled(promises);
  }

  /**
   * Update shard health information with type safety
   */
  private updateShardHealth(
    shardId: number,
    updates: Partial<ShardHealthMetrics>,
  ): void {
    const health = this.shardHealth.get(shardId);
    if (health) {
      Object.assign(health, updates);
      this.emit("shardHealthUpdate", shardId, health);
    }
  }

  /**
   * Increment error count for a shard with intelligent handling
   */
  private incrementShardErrors(shardId: number): void {
    const health = this.shardHealth.get(shardId);
    if (health) {
      health.errors++;

      if (health.errors > CONSTANTS.ERROR_THRESHOLD && health.status !== "dead") {
        logger.warn(
          `Shard ${shardId} has ${health.errors} errors, considering restart`,
        );
        this.considerShardRestart(shardId);
      }
    }
  }

  /**
   * Handle shard death with exponential backoff
   */
  private handleShardDeath(shard: Shard): void {
    const health = this.shardHealth.get(shard.id);
    if (!health) return;

    health.restarts++;

    if (health.restarts > config.maxShardRestarts) {
      logger.error(
        `Shard ${shard.id} exceeded maximum restart attempts (${config.maxShardRestarts})`,
      );
      this.emit("shardMaxRestartsExceeded", shard.id);
      return;
    }

    // Exponential backoff with jitter
    const backoffTime = Math.min(
      CONSTANTS.BASE_RESTART_DELAY * Math.pow(2, health.restarts - 1) + Math.random() * 1000,
      CONSTANTS.MAX_RESTART_DELAY,
    );

    logger.info(
      `Scheduling shard ${shard.id} restart in ${Math.round(backoffTime)}ms (attempt ${health.restarts}/${config.maxShardRestarts})`,
    );

    setTimeout(() => {
      if (!this.isShuttingDown) {
        this.restartShard(shard.id);
      }
    }, backoffTime);
  }

  /**
   * Consider restarting a problematic shard
   */
  private considerShardRestart(shardId: number): void {
    const health = this.shardHealth.get(shardId);
    if (!health || health.restarts > config.maxShardRestarts) return;

    const timeSinceLastHeartbeat = Date.now() - health.lastHeartbeat;

    if (timeSinceLastHeartbeat > CONSTANTS.UNHEALTHY_THRESHOLD) {
      logger.warn(`Restarting unresponsive shard ${shardId}`);
      this.restartShard(shardId);
    }
  }

  /**
   * Restart a specific shard with proper error handling
   */
  private async restartShard(shardId: number): Promise<void> {
    try {
      logger.info(`🔄 Restarting shard ${shardId}`);

      const shard = this.manager.shards.get(shardId);
      if (shard) {
        await shard.respawn({
          delay: CONSTANTS.SPAWN_DELAY,
          timeout: config.timeout,
        });

        const health = this.shardHealth.get(shardId);
        if (health) {
          health.restarts++;
          health.errors = 0; // Reset error count on successful restart
          health.lastHeartbeat = Date.now();
        }

        this.emit("shardRestarted", shardId);
      }
    } catch (error) {
      logger.error(`Failed to restart shard ${shardId}:`, error);
      this.emit("shardRestartFailed", shardId, error);
    }
  }

  /**
   * Setup Top.gg integration with error handling
   */
  private setupTopGG(): void {
    if (!config.topggKey) {
      logger.warn("No Top.gg API key provided, skipping stats posting");
      return;
    }

    try {
      this.autoPoster = AutoPoster(config.topggKey, this.manager);

      this.autoPoster.on("posted", () => {
        logger.info("📊 Posted stats to Top.gg!");
      });

      this.autoPoster.on("error", (error: Error) => {
        logger.error("Top.gg posting error:", error);
      });

      logger.info("✅ Top.gg autoposter initialized");
    } catch (error) {
      logger.error("Failed to setup Top.gg autoposter:", error);
    }
  }

  /**
   * Start health monitoring with configurable intervals
   */
  private startHealthMonitoring(): void {
    // Health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, config.healthCheckInterval);

    // Stats aggregation interval
    this.statsInterval = setInterval(() => {
      this.aggregateGlobalStats();
    }, config.statsInterval);

    logger.info(
      `✅ Health monitoring started (health: ${config.healthCheckInterval}ms, stats: ${config.statsInterval}ms)`,
    );
  }

  /**
   * Perform comprehensive health check with detailed metrics
   */
  private performHealthCheck(): void {
    const now = Date.now();
    let unhealthyShards = 0;

    this.shardHealth.forEach((health, shardId) => {
      const timeSinceHeartbeat = now - health.lastHeartbeat;

      if (timeSinceHeartbeat > CONSTANTS.HEARTBEAT_TIMEOUT) {
        unhealthyShards++;
        logger.warn(
          `Shard ${shardId} unhealthy: last heartbeat ${Math.round(timeSinceHeartbeat / 1000)}s ago`,
        );

        // Try to ping shard
        const shard = this.manager.shards.get(shardId);
        if (shard) {
          shard
            .eval("({ ping: this.ws.ping, uptime: this.uptime })")
            .then((result: { ping: number; uptime: number }) => {
              this.updateShardHealth(shardId, {
                ping: result.ping,
                uptime: result.uptime,
                lastHeartbeat: now,
              });
            })
            .catch((error) => {
              logger.warn(`Shard ${shardId} not responding to eval:`, error);
            });
        }
      }
    });

    if (unhealthyShards > 0) {
      logger.warn(
        `Health check: ${unhealthyShards}/${this.shardHealth.size} shards unhealthy`,
      );
    }

    this.emit("healthCheckCompleted", {
      totalShards: this.shardHealth.size,
      unhealthyShards,
      timestamp: now,
    });
  }

  /**
   * Aggregate global statistics with comprehensive metrics (memory-optimized)
   */
  private aggregateGlobalStats(): void {
    let totalGuilds = 0;
    let totalUsers = 0;
    let totalChannels = 0;
    let healthyShards = 0;
    let totalUptime = 0;
    let totalRestarts = 0;
    let totalPing = 0;
    let totalMemoryUsage = 0;
    let pingCount = 0;

    for (const health of this.shardHealth.values()) {
      totalGuilds += health.guilds;
      totalUsers += health.users;
      totalChannels += health.channels;
      totalRestarts += health.restarts;
      totalMemoryUsage += health.memory.heapUsed || 0;

      // Count shards as healthy if they're not dead or disconnected
      if (health.status !== "dead" && health.status !== "disconnected") {
        healthyShards++;
      }

      // Only collect detailed stats from ready shards
      if (health.status === "ready") {
        totalUptime += health.uptime;

        if (health.ping > 0) {
          totalPing += health.ping;
          pingCount++;
        }
      }
    }

    this.globalStats = {
      totalGuilds,
      totalUsers,
      totalChannels,
      totalShards: this.shardHealth.size,
      healthyShards,
      avgPing: pingCount > 0 ? totalPing / pingCount : 0,
      avgUptime: healthyShards > 0 ? totalUptime / healthyShards : 0,
      totalRestarts,
      totalMemoryUsage,
      lastUpdate: Date.now(),
    };

    this.emit("globalStatsUpdate", this.globalStats);

    // Log comprehensive stats every 10 minutes (kept for backward compatibility)
    if (Date.now() % CONSTANTS.DETAILED_STATS_LOG_MODULO < config.statsInterval) {
      logger.info(
        `📈 Global Stats: ${totalGuilds} guilds, ${totalUsers} users, ${totalChannels} channels across ${healthyShards}/${this.shardHealth.size} shards`,
      );
    }
  }

  /**
   * Log detailed statistics every 15 minutes (memory-optimized)
   */
  private async logDetailedStats(): Promise<void> {
    const uptime = Date.now() - this.startTime;
    const uptimeMinutes = Math.floor(uptime / 60000);

    logger.info("═══════════════════════════════════════");
    logger.info("🤖 SMOKEY BOT SHARD MANAGER");
    logger.info("═══════════════════════════════════════");

    // Manager uptime and basic info
    logger.info(`⏱️  Manager Uptime: ${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m`);
    logger.info(`🔧 Runtime: Bun ${Bun.version}`);
    logger.info(`🌍 Environment: ${config.isDev ? "Development" : "Production"}`);

    // Shard health overview
    let healthyCount = 0;
    let readyCount = 0;
    let reconnectingCount = 0;
    let deadCount = 0;

    for (const health of this.shardHealth.values()) {
      switch (health.status) {
        case "ready":
          readyCount++;
          healthyCount++;
          break;
        case "reconnecting":
          reconnectingCount++;
          break;
        case "dead":
        case "disconnected":
          deadCount++;
          break;
        default:
          healthyCount++;
      }
    }

    logger.info(`📊 Shard Status: ${readyCount} ready, ${reconnectingCount} reconnecting, ${deadCount} dead`);

    // Global statistics
    const stats = this.globalStats;
    logger.info(`🏰 Total Guilds: ${stats.totalGuilds.toLocaleString()}`);
    logger.info(`👥 Total Users: ${stats.totalUsers.toLocaleString()}`);
    logger.info(`💬 Total Channels: ${stats.totalChannels.toLocaleString()}`);
    logger.info(`🏥 Health: ${stats.healthyShards}/${stats.totalShards} shards healthy`);
    logger.info(`🏓 Avg Ping: ${Math.round(stats.avgPing)}ms`);
    logger.info(`🔄 Total Restarts: ${stats.totalRestarts}`);

    // Memory usage
    const memoryMB = Math.round(stats.totalMemoryUsage / 1024 / 1024);
    logger.info(`🧠 Memory Usage: ${memoryMB}MB`);

    // Fetch top guilds on-demand (lazy loading)
    try {
      const allGuilds = await this.broadcastEval((client) =>
        Array.from(client.guilds.cache.values()).map((guild: any) => ({
          name: guild.name,
          memberCount: guild.memberCount || 0,
          shardId: client.shard?.ids[0] || 0,
        }))
      );

      const flatGuilds = allGuilds.flat().sort((a, b) => b.memberCount - a.memberCount).slice(0, 5);

      if (flatGuilds.length > 0) {
        logger.info("🏆 Top 5 Largest Guilds:");
        flatGuilds.forEach((guild, index) => {
          logger.info(`  ${index + 1}. ${guild.name} - ${guild.memberCount.toLocaleString()} members (Shard ${guild.shardId})`);
        });
      }
    } catch (error) {
      logger.debug("Could not fetch largest guilds:", error);
    }

    // Performance metrics per shard
    logger.info("⚡ Shard Performance:");
    this.shardHealth.forEach((health, shardId) => {
      const uptimeHours = Math.floor((health.uptime || 0) / 3600000);
      const memMB = Math.round((health.memory?.heapUsed || 0) / 1024 / 1024);
      logger.info(`  Shard ${shardId}: ${health.guilds}g, ${health.users}u, ${memMB}MB, ${uptimeHours}h uptime, ${health.errors} errors`);
    });

    logger.info("═══════════════════════════════════════");
  }

  /**
   * Get current global statistics
   */
  public getGlobalStats(): GlobalStatistics {
    return { ...this.globalStats };
  }

  /**
   * Get health information for all shards
   */
  public getShardHealthMap(): Map<number, ShardHealthMetrics> {
    return new Map(this.shardHealth);
  }

  /**
   * Get health information for a specific shard
   */
  public getShardHealth(shardId: number): ShardHealthMetrics | undefined {
    return this.shardHealth.get(shardId);
  }

  /**
   * Send message to specific shard via manager routing
   */
  public async sendToShard(
    shardId: number,
    type: string,
    data: any,
  ): Promise<void> {
    // Validate shard ID to prevent -1 messages
    if (shardId < 0 || !this.manager.shards.has(shardId)) {
      logger.warn(`Cannot send message to invalid shard ID ${shardId}`);
      return;
    }

    const message: InterShardMessage = {
      type,
      fromShard: -1, // From manager (this is intentional for manager messages)
      toShard: shardId,
      data,
      timestamp: Date.now(),
      id: generateMessageId(),
    };

    // Manager always routes directly to shards
    await this.sendInterShardMessage(shardId, message);
  }

  /**
   * Broadcast message to all shards
   */
  public async broadcastToAllShards(type: string, data: any): Promise<void> {
    if (this.manager.shards.size === 0) {
      logger.warn('No shards available for broadcast');
      return;
    }

    const message: InterShardMessage = {
      type,
      fromShard: -1, // From manager (this is intentional for manager messages)
      toShard: "all",
      data,
      timestamp: Date.now(),
      id: generateMessageId(),
    };

    // Manager always broadcasts directly to shards
    await this.broadcastInterShardMessage(message);
  }

  /**
   * broadcast evaluation with timeout and error handling
   */
  public async broadcastEval<T>(
    script: (client: any) => T,
    options: { shard?: number } = {},
  ): Promise<T[]> {
    try {
      const results = await this.manager.broadcastEval(script, {
        shard: options.shard,
      });

      logger.debug(`Broadcast eval completed: ${(results as T[]).length} responses`);
      return results as T[];
    } catch (error) {
      logger.error("Broadcast eval failed:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive bot statistics
   */
  public async getBotStats(): Promise<any> {
    try {
      const results = await this.broadcastEval((client) => ({
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        channels: client.channels.cache.size,
        uptime: client.uptime,
        ping: client.ws.ping,
        memory: process.memoryUsage(),
        shardId: client.shard?.ids[0],
        readyAt: client.readyAt?.toISOString(),
        guildDetails: Array.from(client.guilds.cache.values()).map((guild: any) => ({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount || 0,
          shardId: client.shard?.ids[0] || 0,
          joinedAt: guild.joinedTimestamp || Date.now(),
          channelCount: guild.channels.cache.size,
          roleCount: guild.roles.cache.size
        }))
      }));

      return {
        shards: results,
        global: this.globalStats,
        managerUptime: Date.now() - this.startTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error("Failed to get bot stats:", error);
      return null;
    }
  }

  /**
   * Dispose of all resources and intervals to prevent memory leaks
   */
  public dispose(): void {
    // Clear all intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = undefined;
    }
    if (this.detailedStatsInterval) {
      clearInterval(this.detailedStatsInterval);
      this.detailedStatsInterval = undefined;
    }
    if (this.guildStatsRefreshInterval) {
      clearInterval(this.guildStatsRefreshInterval);
      this.guildStatsRefreshInterval = undefined;
    }
    if (this.healthAlertInterval) {
      clearInterval(this.healthAlertInterval);
      this.healthAlertInterval = undefined;
    }

    // Clear all maps and collections
    this.shardHealth.clear();

    // Remove all event listeners
    this.removeAllListeners();

    logger.info("✅ EnhancedShardManager resources disposed");
  }

  /**
   * Graceful shutdown of all components
   */
  public async shutdown(): Promise<void> {
    logger.info("🛑 Initiating graceful shutdown...");
    this.isShuttingDown = true;

    try {
      // Dispose of all resources
      this.dispose();

      // Close communication manager
      if (this.communicationManager) {
        await this.communicationManager.close();
        logger.info("✅ Communication manager closed");
      }

      // Notify all shards of shutdown
      await this.broadcastToAllShards("shutdown", { graceful: true });

      // Wait for shards to shutdown gracefully
      await new Promise((resolve) => setTimeout(resolve, CONSTANTS.SHUTDOWN_GRACE_PERIOD));

      // Force destroy all shards
      const destroyPromises = Array.from(this.manager.shards.values()).map(
        (shard) =>
          shard.eval("this.destroy()").catch((error) => {
            logger.warn(`Failed to destroy shard ${shard.id}:`, error);
          }),
      );

      await Promise.allSettled(destroyPromises);

      logger.info("✅ Graceful shutdown completed");
    } catch (error) {
      logger.error("Error during shutdown:", error);
    }
  }

  /**
   * Handle guild stats received from shards
   */
  private handleGuildStatsReceived(data: any): void {
    const health = this.shardHealth.get(data.shardId);
    if (health) {
      health.guildDetails = data.guilds;
      logger.debug(`Updated guild details for shard ${data.shardId}: ${data.guilds.length} guilds`);
    }
  }

  /**
   * Update guild tracking for add/remove events (lightweight)
   */
  private updateGuildTracking(type: string, data: any): void {
    const shardId = data.shardId !== undefined ? data.shardId : 0;
    logger.debug(`Guild ${type}: ${data.guildName} (${data.guildId}) on shard ${shardId}`);
    // Just log the event - no need to store in memory
    // Stats will be updated on next aggregation cycle
  }

  /**
   * Request guild stats from a specific shard
   */
  public async requestGuildStatsFromShard(shardId: number): Promise<void> {
    const requestId = generateMessageId();
    await this.sendToShard(shardId, "guildStatsRequest", { requestId });
  }

  /**
   * Request guild stats from all shards
   */
  public async requestGuildStatsFromAllShards(): Promise<void> {
    const requestId = generateMessageId();
    await this.broadcastToAllShards("guildStatsRequest", { requestId });
  }

  /**
   * Start the shard manager
   */
  public async start(): Promise<void> {
    try {
      logger.info(`🚀 Starting SmokeyBot Shard Manager...`);
      logger.info(`Environment: ${config.isDev ? "Development" : "Production"}`);
      logger.info(`Runtime: Bun ${Bun.version}`);
      logger.info(`Respawn: ${config.respawn ? "Enabled" : "Disabled"}`);
      logger.info(`Communication: ${config.useRedis ? `Redis (${config.redisUrl})` : config.useWebSocket ? `WebSocket (port ${config.wsPort})` : "Direct"}`);

      // Initialize cross-server communication manager if configured
      if (this.communicationManager) {
        try {
          await this.communicationManager.initialize();
          logger.info("✅ Cross-server communication initialized");
        } catch (error) {
          if (config.isDev && config.useWebSocket) {
            logger.warn("⚠️ Cross-server communication failed to initialize in development mode, falling back to single-server mode");
            logger.info("💡 This is normal for local development - the bot will still function with limited inter-shard communication");
            this.communicationManager = undefined;
          } else {
            logger.error("❌ Failed to initialize cross-server communication:", error);
            throw error;
          }
        }
      }

      if (!this.communicationManager) {
        logger.info("💻 Single-server mode - no cross-server communication");
      }

      const shards = await this.manager.spawn({
        amount: config.isDev ? 1 : "auto",
        delay: CONSTANTS.SPAWN_DELAY,
        timeout: config.timeout,
      });

      logger.info(`✅ Successfully spawned ${shards.size} shard(s)`);

      // Start monitoring after all shards are spawned
      this.startHealthMonitoring();

      // Start detailed stats logging every 15 minutes
      this.detailedStatsInterval = setInterval(() => {
        this.logDetailedStats();
      }, CONSTANTS.DETAILED_STATS_INTERVAL);

      // Initial stats collection after 30 seconds
      setTimeout(() => {
        this.aggregateGlobalStats();
        // Request detailed guild stats from all shards
        this.requestGuildStatsFromAllShards();
        // Log first detailed stats after 60 seconds (allow time for data collection)
        setTimeout(() => {
          this.logDetailedStats();
        }, CONSTANTS.INITIAL_STATS_DELAY);
      }, CONSTANTS.INITIAL_STATS_DELAY);

      // Periodic guild stats refresh every 5 minutes
      this.guildStatsRefreshInterval = setInterval(() => {
        this.requestGuildStatsFromAllShards();
      }, CONSTANTS.GUILD_STATS_REFRESH_INTERVAL);

      this.emit("managerReady", {
        totalShards: shards.size,
        environment: config.isDev ? "development" : "production",
        startTime: this.startTime,
      });
    } catch (error) {
      logger.error("Failed to start shard manager:", error);
      throw new ShardManagerError(
        "Shard manager startup failed",
        "STARTUP_ERROR",
      );
    }
  }
}

// Create and export shard manager instance
export const enhancedManager = new EnhancedShardManager();
export const manager = enhancedManager.manager; // Backward compatibility

// Graceful process handlers with logging
const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, initiating graceful shutdown...`);
  try {
    await enhancedManager.shutdown();
    logger.info(`✅ Graceful shutdown completed for ${signal}`);
    process.exit(0);
  } catch (error) {
    logger.error(`Error during ${signal} shutdown:`, error);
    process.exit(1);
  }
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection at:", promise);
  logger.error("Reason:", reason);

  // In production, we might want to restart
  if (!config.isDev) {
    logger.error("Unhandled rejection in production, exiting...");
    process.exit(1);
  }
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  logger.error("Stack trace:", error.stack);

  // Always exit on uncaught exceptions
  process.exit(1);
});

// startup with better error handling
const startManager = async () => {
  try {
    await enhancedManager.start();

    // Log startup success
    logger.info("🎉 SmokeyBot Shard Manager started successfully!");

    // Set up periodic health reporting - Note: This is in the global scope and should be cleaned up separately if needed
    const healthAlertInterval = setInterval(() => {
      const stats = enhancedManager.getGlobalStats();
      if (stats.healthyShards < stats.totalShards) {
        logger.warn(
          `⚠️  Health Alert: ${stats.healthyShards}/${stats.totalShards} shards healthy`,
        );
      }
    }, CONSTANTS.HEALTH_ALERT_INTERVAL);

  } catch (error) {
    logger.error("💥 Fatal startup error:", error);

    if (error instanceof ShardManagerError) {
      logger.error(`Error Code: ${error.code}`);
      if (error.shardId !== undefined) {
        logger.error(`Shard ID: ${error.shardId}`);
      }
    }

    process.exit(1);
  }
};

// Start the manager
startManager();

// Export types and utilities for external use
export { ShardManagerError };
export type {
  CommunicationManager, GlobalStatistics, InterShardMessage, ShardHealthMetrics
};

