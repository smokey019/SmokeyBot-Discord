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
  private actualPort?: number;

  async initialize(): Promise<void> {
    return this.tryInitializeWithFallback(config.wsPort);
  }

  private async tryInitializeWithFallback(port: number, attemptedPorts: number[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        attemptedPorts.push(port);

        // Clean up previous server if exists
        if (this.server) {
          this.server.removeAllListeners();
          this.server.close();
        }

        this.server = new WebSocketServer({
          port,
          verifyClient: (info) => {
            // Add authentication logic here if needed
            return true;
          },
        });

        this.server.on("error", (error: any) => {
          const errorDetails = {
            message: error.message || 'Unknown error',
            code: error.code || 'No code',
            errno: error.errno || 'No errno',
            port: port,
            type: error.constructor.name
          };

          logger.error(`WebSocket server error details:`, errorDetails);

          if (error.code === 'EADDRINUSE' && config.isDev) {
            // Try fallback ports in development (max 5 attempts)
            const fallbackPorts = config.devFallbackPorts.filter(p => !attemptedPorts.includes(p));
            if (fallbackPorts.length > 0 && attemptedPorts.length < 5) {
              const nextPort = fallbackPorts[0];
              logger.warn(`⚠️ Port ${port} in use, trying fallback port ${nextPort} (attempt ${attemptedPorts.length + 1}/5)`);

              setTimeout(() => {
                this.tryInitializeWithFallback(nextPort, attemptedPorts).then(resolve).catch(reject);
              }, 500); // Small delay between server startup attempts
              return;
            } else {
              logger.error(`❌ All fallback ports exhausted. Attempted ports: ${attemptedPorts.join(', ')}`);
              logger.info(`💡 For local development, you can disable WebSocket with USE_WEBSOCKET=false in your environment`);
            }
          }

          if (error.code === 'EADDRINUSE') {
            logger.error(`❌ Port ${port} is already in use. Try setting WS_PORT to a different port or disable WebSocket communication.`);
            logger.info(`💡 For development, you can set WS_PORT=8082 or disable with USE_WEBSOCKET=false`);
          }
          reject(error);
        });

        this.actualPort = port;

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
            `✅ WebSocket communication server listening on port ${this.actualPort}`,
          );
          if (config.isDev && this.actualPort !== config.wsPort) {
            logger.info(`👨‍💻 Dev mode: Using fallback port ${this.actualPort} (original ${config.wsPort} was in use)`);
          } else if (config.isDev) {
            logger.info(`👨‍💻 Dev mode: Using port ${this.actualPort} (default dev port is 8081)`);
          }
          resolve();
        });
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

    // Only initialize cross-server communication if explicitly enabled
    // Most deployments will use same-server communication through the manager process
    const enableCrossServer = process.env.FORCE_CROSS_SERVER_COMM === "true";
    
    if (enableCrossServer) {
      if (config.useRedis) {
        this.communicationManager = new RedisCommunicationManager();
        logger.info("📡 Redis communication enabled for cross-server messaging");
      } else if (config.useWebSocket) {
        this.communicationManager = new WebSocketCommunicationManager();
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

    // Update guild distribution mapping
    if (this.globalStats.guildDistribution) {
      const guildData = this.globalStats.guildDistribution.get(oldId);
      if (guildData) {
        // Update shard ID in all guild entries
        guildData.forEach(guild => guild.shardId = newId);
        this.globalStats.guildDistribution.set(newId, guildData);
        this.globalStats.guildDistribution.delete(oldId);
      }
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
      logger.debug(
        `Shard[${shard.id}]: ${message._eval} -> ${message._result}`,
      );
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

      default:
        logger.debug(`Unknown message type from shard ${shard.id}:`, message);
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
        this.updateGuildDistribution(message.data);
        break;
      case "guildLeft":
        this.removeFromGuildDistribution(message.data);
        break;
      case "ready":
        logger.info(`Inter-shard ready notification from shard ${message.fromShard}`);
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
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
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
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    };

    // Manager always broadcasts directly to shards
    await this.broadcastInterShardMessage(message);
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
    const shardId = data.shardId !== undefined ? data.shardId : 0;
    logger.debug(`Guild ${type}: ${data.guildName} (${data.guildId}) on shard ${shardId}`);
    // Trigger stats refresh for affected shard
    this.requestGuildStatsFromShard(shardId);
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

