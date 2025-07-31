import { Shard, ShardingManager } from "discord.js";
import { EventEmitter } from "events";
import { createClient } from "redis";
import AutoPoster from "topgg-autoposter";
import { WebSocket, WebSocketServer } from "ws";
import { getLogger } from "./clients/logger";

const logger = getLogger("ShardManager");

// configuration with environment validation
const config = {
  token: process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_DEV,
  topggKey: process.env.TOPGG_KEY,
  isDev: process.env.DEV === "true",
  respawn: process.env.SHARD_RESPAWN !== "false",
  timeout: parseInt(process.env.SHARD_TIMEOUT || "30000"),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  wsPort: parseInt(process.env.WS_PORT || "8080"),
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

// Communication interfaces
interface InterShardMessage {
  type: string;
  fromShard?: number;
  toShard?: number | "all";
  data: any;
  timestamp: number;
  id: string;
}

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
  guildDistribution?: Map<number, GuildShardInfo[]>;
  largestGuilds?: GuildShardInfo[];
}

interface CommunicationManager {
  initialize(): Promise<void>;
  broadcast(message: InterShardMessage): Promise<void>;
  sendToShard(shardId: number, message: InterShardMessage): Promise<void>;
  subscribe(callback: (message: InterShardMessage) => void): void;
  close(): Promise<void>;
}

// Redis Communication Manager
class RedisCommunicationManager implements CommunicationManager {
  private client?: ReturnType<typeof createClient>;
  private subscriber?: ReturnType<typeof createClient>;
  private callbacks: Array<(message: InterShardMessage) => void> = [];

  async initialize(): Promise<void> {
    try {
      this.client = createClient({ url: config.redisUrl });
      this.subscriber = createClient({ url: config.redisUrl });

      await this.client.connect();
      await this.subscriber.connect();

      await this.subscriber.subscribe("shard-manager", (message) => {
        try {
          const parsedMessage: InterShardMessage = JSON.parse(message);
          this.callbacks.forEach((callback) => callback(parsedMessage));
        } catch (error) {
          logger.error("Failed to parse Redis message:", error);
        }
      });

      logger.info("✅ Redis communication manager initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Redis:", error);
      throw error;
    }
  }

  async broadcast(message: InterShardMessage): Promise<void> {
    if (!this.client) throw new Error("Redis client not initialized");
    await this.client.publish("shard-manager", JSON.stringify(message));
  }

  async sendToShard(shardId: number, message: InterShardMessage): Promise<void> {
    if (!this.client) throw new Error("Redis client not initialized");
    message.toShard = shardId;
    await this.client.publish(`shard-${shardId}`, JSON.stringify(message));
  }

  subscribe(callback: (message: InterShardMessage) => void): void {
    this.callbacks.push(callback);
  }

  async close(): Promise<void> {
    await this.client?.disconnect();
    await this.subscriber?.disconnect();
  }
}

// WebSocket Communication Manager
class WebSocketCommunicationManager implements CommunicationManager {
  private server?: WebSocketServer;
  private clients = new Map<number, WebSocket>();
  private callbacks: Array<(message: InterShardMessage) => void> = [];

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({
          port: config.wsPort,
          verifyClient: (info) => {
            // Add authentication logic here if needed
            return true;
          },
        });

        this.server.on("connection", (ws, req) => {
          const shardId = parseInt(
            new URL(req.url!, `http://${req.headers.host}`).searchParams.get(
              "shardId",
            ) || "-1",
          );

          if (shardId >= 0) {
            this.clients.set(shardId, ws);
            logger.debug(`Shard ${shardId} connected via WebSocket`);

            ws.on("message", (data) => {
              try {
                const message: InterShardMessage = JSON.parse(data.toString());
                this.callbacks.forEach((callback) => callback(message));
              } catch (error) {
                logger.error("Failed to parse WebSocket message:", error);
              }
            });

            ws.on("close", () => {
              this.clients.delete(shardId);
              logger.debug(`Shard ${shardId} disconnected from WebSocket`);
            });

            ws.on("error", (error) => {
              logger.error(`WebSocket error for shard ${shardId}:`, error);
              this.clients.delete(shardId);
            });
          }
        });

        this.server.on("listening", () => {
          logger.info(
            `✅ WebSocket communication server listening on port ${config.wsPort}`,
          );
          resolve();
        });

        this.server.on("error", reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async broadcast(message: InterShardMessage): Promise<void> {
    const messageStr = JSON.stringify(message);
    for (const [shardId, ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          logger.error(`Failed to send message to shard ${shardId}:`, error);
        }
      }
    }
  }

  async sendToShard(shardId: number, message: InterShardMessage): Promise<void> {
    const ws = this.clients.get(shardId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      message.toShard = shardId;
      ws.send(JSON.stringify(message));
    } else {
      throw new Error(`Shard ${shardId} not connected via WebSocket`);
    }
  }

  subscribe(callback: (message: InterShardMessage) => void): void {
    this.callbacks.push(callback);
  }

  async close(): Promise<void> {
    if (this.server) {
      for (const ws of this.clients.values()) {
        ws.close();
      }
      this.server.close();
    }
  }
}

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
    guildDistribution: new Map(),
    largestGuilds: [],
  };
  private healthCheckInterval?: Timer;
  private statsInterval?: Timer;
  private autoPoster?: any;
  private isShuttingDown = false;
  private communicationManager?: CommunicationManager;
  private startTime = Date.now();

  constructor() {
    super();

    // Validate environment
    if (!config.token) {
      throw new ShardManagerError("Missing Discord token", "MISSING_TOKEN");
    }

    // Initialize communication manager
    if (config.useRedis) {
      this.communicationManager = new RedisCommunicationManager();
    } else if (config.useWebSocket) {
      this.communicationManager = new WebSocketCommunicationManager();
    }

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

    // Setup communication message handling
    if (this.communicationManager) {
      this.communicationManager.subscribe((message) => {
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
        try {
          this.handleShardMessage(shard, message);
        } catch (error) {
          logger.error(
            `Error handling message from shard ${shard.id}:`,
            error,
          );
        }
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
  private handleShardMessage(shard: Shard, message: any): void {
    const health = this.shardHealth.get(shard.id);
    if (!health) return;

    // Handle evaluation results
    if (message._eval) {
      logger.debug(
        `Shard[${shard.id}]: ${message._eval} -> ${message._result}`,
      );
      return;
    }

    // message type handling
    switch (message.type) {
      case "stats":
        this.updateShardHealth(shard.id, {
          guilds: message.guilds || 0,
          users: message.users || 0,
          channels: message.channels || 0,
          memory: message.memory || process.memoryUsage(),
          ping: message.ping || 0,
          cpu: message.cpu || 0,
          eventLoopLag: message.eventLoopLag || 0,
          lastHeartbeat: Date.now(),
        });
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

      case "guildAdd":
      case "guildRemove":
        // Update guild tracking
        this.updateGuildTracking(message.type, message.data);
        break;

      case "inter-shard":
        // Handle inter-shard communication
        this.handleInterShardMessage(message.data as InterShardMessage);
        break;

      default:
        logger.debug(`Unknown message type from shard ${shard.id}:`, message);
    }
  }

  /**
   * Handle inter-shard communication messages
   */
  private handleInterShardMessage(message: InterShardMessage): void {
    logger.debug(`Inter-shard message: ${message.type}`, message);

    // Handle specific message types
    switch (message.type) {
      case "guildJoined":
        this.updateGuildDistribution(message.data);
        break;
      case "guildLeft":
        this.removeFromGuildDistribution(message.data);
        break;
    }

    // Route message to specific shard or broadcast
    if (message.toShard === "all") {
      this.broadcastInterShardMessage(message);
    } else if (typeof message.toShard === "number") {
      this.sendInterShardMessage(message.toShard, message);
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
    const shard = this.manager.shards.get(shardId);
    if (shard) {
      try {
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
    }
  }

  /**
   * Broadcast inter-shard message to all shards
   */
  private async broadcastInterShardMessage(
    message: InterShardMessage,
  ): Promise<void> {
    const promises = Array.from(this.manager.shards.values()).map(
      async (shard) => {
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

      const errorThreshold = 10;
      if (health.errors > errorThreshold && health.status !== "dead") {
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
    const baseDelay = 5000;
    const backoffTime = Math.min(
      baseDelay * Math.pow(2, health.restarts - 1) + Math.random() * 1000,
      60000,
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
    const unhealthyThreshold = 300000; // 5 minutes

    if (timeSinceLastHeartbeat > unhealthyThreshold) {
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
          delay: 5000,
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
    const unhealthyThreshold = 120000; // 2 minutes
    let unhealthyShards = 0;

    for (const [shardId, health] of this.shardHealth.entries()) {
      const timeSinceHeartbeat = now - health.lastHeartbeat;

      if (timeSinceHeartbeat > unhealthyThreshold) {
        unhealthyShards++;
        logger.warn(
          `Shard ${shardId} unhealthy: last heartbeat ${Math.round(timeSinceHeartbeat / 1000)}s ago`,
        );

        // Try to ping shard
        const shard = this.manager.shards.get(shardId);
        if (shard) {
          shard
            .eval("({ ping: this.ws.ping, uptime: this.uptime })")
            .then((result) => {
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
    }

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
   * Aggregate global statistics with comprehensive metrics
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
    const guildDistribution = new Map<number, GuildShardInfo[]>();
    const allGuilds: GuildShardInfo[] = [];

    for (const health of this.shardHealth.values()) {
      totalGuilds += health.guilds;
      totalUsers += health.users;
      totalChannels += health.channels;
      totalRestarts += health.restarts;
      totalMemoryUsage += health.memory.heapUsed || 0;

      // Collect guild details if available
      if (health.guildDetails) {
        guildDistribution.set(health.id, health.guildDetails);
        allGuilds.push(...health.guildDetails);
      }

      if (health.status === "ready") {
        healthyShards++;
        totalUptime += health.uptime;

        if (health.ping > 0) {
          totalPing += health.ping;
          pingCount++;
        }
      }
    }

    // Sort guilds by member count to find largest
    const largestGuilds = allGuilds
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, 10);

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
      guildDistribution,
      largestGuilds,
    };

    this.emit("globalStatsUpdate", this.globalStats);

    // Log comprehensive stats every 10 minutes
    if (Date.now() % 600000 < config.statsInterval) {
      logger.info(
        `📈 Global Stats: ${totalGuilds} guilds, ${totalUsers} users, ${totalChannels} channels across ${healthyShards}/${this.shardHealth.size} shards`,
      );
      
      // Log guild distribution
      const guildCounts = Array.from(guildDistribution.entries())
        .map(([shardId, guilds]) => `Shard ${shardId}: ${guilds.length}`)
        .join(", ");
      logger.info(`🏰 Guild Distribution: ${guildCounts}`);
    }
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
   * Send message to specific shard via communication manager
   */
  public async sendToShard(
    shardId: number,
    type: string,
    data: any,
  ): Promise<void> {
    const message: InterShardMessage = {
      type,
      toShard: shardId,
      data,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    };

    if (this.communicationManager) {
      await this.communicationManager.sendToShard(shardId, message);
    } else {
      await this.sendInterShardMessage(shardId, message);
    }
  }

  /**
   * Broadcast message to all shards
   */
  public async broadcastToAllShards(type: string, data: any): Promise<void> {
    const message: InterShardMessage = {
      type,
      toShard: "all",
      data,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    };

    if (this.communicationManager) {
      await this.communicationManager.broadcast(message);
    } else {
      await this.broadcastInterShardMessage(message);
    }
  }

  /**
   * broadcast evaluation with timeout and error handling
   */
  public async broadcastEval<T>(
    script: (client: any) => T,
    options: { timeout?: number; shard?: number } = {},
  ): Promise<T[]> {
    try {
      const results = await this.manager.broadcastEval(script, {
        timeout: options.timeout || config.timeout,
        shard: options.shard,
      });

      logger.debug(`Broadcast eval completed: ${results.length} responses`);
      return results;
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
        guildDetails: Array.from(client.guilds.cache.values()).map(guild => ({
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
   * Graceful shutdown of all components
   */
  public async shutdown(): Promise<void> {
    logger.info("🛑 Initiating graceful shutdown...");
    this.isShuttingDown = true;

    try {
      // Clear intervals
      if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
      if (this.statsInterval) clearInterval(this.statsInterval);

      // Close communication manager
      if (this.communicationManager) {
        await this.communicationManager.close();
        logger.info("✅ Communication manager closed");
      }

      // Notify all shards of shutdown
      await this.broadcastToAllShards("shutdown", { graceful: true });

      // Wait for shards to shutdown gracefully
      await new Promise((resolve) => setTimeout(resolve, 5000));

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
   * Update guild tracking for add/remove events
   */
  private updateGuildTracking(type: string, data: any): void {
    logger.debug(`Guild ${type}: ${data.guildName} (${data.guildId}) on shard ${data.shardId}`);
    // Trigger stats refresh for affected shard
    this.requestGuildStatsFromShard(data.shardId);
  }

  /**
   * Update guild distribution when a guild joins
   */
  private updateGuildDistribution(guildData: any): void {
    const { shardId, guildId, guildName, memberCount, joinedAt, channelCount, roleCount } = guildData;
    
    if (!this.globalStats.guildDistribution) {
      this.globalStats.guildDistribution = new Map();
    }
    
    let shardGuilds = this.globalStats.guildDistribution.get(shardId) || [];
    
    // Add new guild if not already exists
    if (!shardGuilds.find(g => g.id === guildId)) {
      shardGuilds.push({
        id: guildId,
        name: guildName,
        memberCount: memberCount || 0,
        shardId,
        joinedAt: joinedAt || Date.now(),
        channelCount,
        roleCount
      });
      
      this.globalStats.guildDistribution.set(shardId, shardGuilds);
      logger.debug(`Added guild ${guildName} to shard ${shardId} distribution`);
    }
  }

  /**
   * Remove guild from distribution when it leaves
   */
  private removeFromGuildDistribution(guildData: any): void {
    const { shardId, guildId } = guildData;
    
    if (this.globalStats.guildDistribution) {
      let shardGuilds = this.globalStats.guildDistribution.get(shardId) || [];
      shardGuilds = shardGuilds.filter(g => g.id !== guildId);
      this.globalStats.guildDistribution.set(shardId, shardGuilds);
      logger.debug(`Removed guild ${guildId} from shard ${shardId} distribution`);
    }
  }

  /**
   * Request guild stats from a specific shard
   */
  public async requestGuildStatsFromShard(shardId: number): Promise<void> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    await this.sendToShard(shardId, "guildStatsRequest", { requestId });
  }

  /**
   * Request guild stats from all shards
   */
  public async requestGuildStatsFromAllShards(): Promise<void> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
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
      logger.info(`Communication: ${config.useRedis ? "Redis" : config.useWebSocket ? "WebSocket" : "Direct"}`);

      // Initialize communication manager if configured
      if (this.communicationManager) {
        await this.communicationManager.initialize();
      }

      const shards = await this.manager.spawn({
        amount: config.isDev ? 1 : "auto",
        delay: 5000, // 5 second delay between spawns
        timeout: config.timeout,
      });

      logger.info(`✅ Successfully spawned ${shards.size} shard(s)`);

      // Start monitoring after all shards are spawned
      this.startHealthMonitoring();

      // Initial stats collection after 30 seconds
      setTimeout(() => {
        this.aggregateGlobalStats();
        // Request detailed guild stats from all shards
        this.requestGuildStatsFromAllShards();
      }, 30000);

      // Periodic guild stats refresh every 5 minutes
      setInterval(() => {
        this.requestGuildStatsFromAllShards();
      }, 300000);

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

    // Set up periodic health reporting
    setInterval(() => {
      const stats = enhancedManager.getGlobalStats();
      if (stats.healthyShards < stats.totalShards) {
        logger.warn(
          `⚠️  Health Alert: ${stats.healthyShards}/${stats.totalShards} shards healthy`,
        );
      }
    }, 300000); // Every 5 minutes

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

