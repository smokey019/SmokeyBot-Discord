import { Shard, ShardingManager } from "discord.js";
import { EventEmitter } from "events";
import AutoPoster from "topgg-autoposter";
import { getLogger } from "./clients/logger";

const logger = getLogger("ShardManager");

// Enhanced configuration with environment validation
const config = {
  token: process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_DEV,
  topggKey: process.env.TOPGG_KEY,
  isDev: process.env.DEV === "true",
  respawn: process.env.SHARD_RESPAWN !== "false",
  timeout: parseInt(process.env.SHARD_TIMEOUT || "30000"),
};

// Enhanced error handling
class ShardManagerError extends Error {
  constructor(message: string, public code: string, public shardId?: number) {
    super(message);
    this.name = "ShardManagerError";
  }
}

// Shard state tracking
interface ShardHealth {
  id: number;
  status: "ready" | "spawning" | "reconnecting" | "dead" | "disconnected";
  lastHeartbeat: number;
  restarts: number;
  uptime: number;
  guilds: number;
  users: number;
  memory: number;
  errors: number;
}

interface GlobalStats {
  totalGuilds: number;
  totalUsers: number;
  totalShards: number;
  healthyShards: number;
  avgUptime: number;
  totalRestarts: number;
  lastUpdate: number;
}

class EnhancedShardManager extends EventEmitter {
  public manager: ShardingManager;
  private shardHealth = new Map<number, ShardHealth>();
  private globalStats: GlobalStats = {
    totalGuilds: 0,
    totalUsers: 0,
    totalShards: 0,
    healthyShards: 0,
    avgUptime: 0,
    totalRestarts: 0,
    lastUpdate: Date.now(),
  };
  private healthCheckInterval?: NodeJS.Timeout;
  private statsInterval?: NodeJS.Timeout;
  private autoPoster?: any;
  private isShuttingDown = false;

  constructor() {
    super();

    // Validate environment
    if (!config.token) {
      throw new ShardManagerError("Missing Discord token", "MISSING_TOKEN");
    }

    // Create enhanced sharding manager
    this.manager = new ShardingManager("./bot.ts", {
      // Use .js in production
      token: config.token,
      totalShards: config.isDev ? 1 : 'auto',
      respawn: config.respawn,
      shardArgs: config.isDev ? ["--dev"] : [],
      execArgv: config.isDev ? ["--inspect=4000"] : [],
    });

    this.setupEventHandlers();
    this.setupTopGG();
  }

  /**
   * Setup enhanced event handlers for shards
   */
  private setupEventHandlers(): void {
    // Enhanced shard creation tracking
    this.manager.on("shardCreate", (shard) => {
      logger.info(`🚀 Launching shard ${shard.id}/${this.manager.totalShards}`);

      this.initializeShardHealth(shard);
      this.setupShardEventHandlers(shard);
    });
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
      memory: 0,
      errors: 0,
    });
  }

  /**
   * Setup comprehensive event handlers for individual shards
   */
  private setupShardEventHandlers(shard: Shard): void {
    // Shard ready
    shard.on("ready", () => {
      logger.info(`✅ Shard ${shard.id} ready`);
      this.updateShardHealth(shard.id, {
        status: "ready",
        lastHeartbeat: Date.now(),
      });
    });

    // Shard death
    shard.on("death", () => {
      logger.error(`💀 Shard ${shard.id} died`);
      this.updateShardHealth(shard.id, { status: "dead" });
      this.handleShardDeath(shard);
    });

    // Shard disconnect
    shard.on("disconnect", () => {
      logger.warn(`🔌 Shard ${shard.id} disconnected`);
      this.updateShardHealth(shard.id, { status: "disconnected" });
    });

    // Shard reconnecting
    shard.on("reconnecting", () => {
      logger.warn(`🔄 Shard ${shard.id} reconnecting`);
      this.updateShardHealth(shard.id, { status: "reconnecting" });
    });

    // Shard spawn
    shard.on("spawn", () => {
      logger.info(`🌱 Shard ${shard.id} spawned`);
      this.updateShardHealth(shard.id, { status: "spawning" });
    });

    // Enhanced message handling with error boundaries
    shard.on("message", (message) => {
      try {
        this.handleShardMessage(shard, message);
      } catch (error) {
        logger.error(`Error handling message from shard ${shard.id}:`, error);
      }
    });

    // Error handling
    shard.on("error", (error) => {
      logger.error(`Shard ${shard.id} error:`, error);
      this.incrementShardErrors(shard.id);
    });
  }

  /**
   * Handle messages from shards
   */
  private handleShardMessage(shard: Shard, message: any): void {
    const health = this.shardHealth.get(shard.id);
    if (!health) return;

    // Handle different message types
    if (message._eval) {
      logger.debug(
        `Shard[${shard.id}]: ${message._eval} -> ${message._result}`
      );
    }

    // Handle stats updates
    if (message.type === "stats") {
      this.updateShardHealth(shard.id, {
        guilds: message.guilds || 0,
        users: message.users || 0,
        memory: message.memory || 0,
        lastHeartbeat: Date.now(),
      });
    }

    // Handle heartbeats
    if (message.type === "heartbeat") {
      this.updateShardHealth(shard.id, { lastHeartbeat: Date.now() });
    }

    // Handle health reports
    if (message.type === "health") {
      this.updateShardHealth(shard.id, {
        ...message.data,
        lastHeartbeat: Date.now(),
      });
    }
  }

  /**
   * Update shard health information
   */
  private updateShardHealth(
    shardId: number,
    updates: Partial<ShardHealth>
  ): void {
    const health = this.shardHealth.get(shardId);
    if (health) {
      Object.assign(health, updates);
      this.emit("shardHealthUpdate", shardId, health);
    }
  }

  /**
   * Increment error count for a shard
   */
  private incrementShardErrors(shardId: number): void {
    const health = this.shardHealth.get(shardId);
    if (health) {
      health.errors++;

      // Auto-restart if too many errors
      if (health.errors > 10 && health.status !== "dead") {
        logger.warn(
          `Shard ${shardId} has ${health.errors} errors, considering restart`
        );
        this.considerShardRestart(shardId);
      }
    }
  }

  /**
   * Handle shard death with intelligent restart logic
   */
  private handleShardDeath(shard: Shard): void {
    const health = this.shardHealth.get(shard.id);
    if (!health) return;

    health.restarts++;

    // Exponential backoff for restarts
    const backoffTime = Math.min(
      5000 * Math.pow(2, health.restarts - 1),
      60000
    );

    logger.info(
      `Scheduling shard ${shard.id} restart in ${backoffTime}ms (attempt ${health.restarts})`
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
    if (!health || health.restarts > 5) return; // Max 5 restarts

    const timeSinceLastRestart = Date.now() - health.lastHeartbeat;
    if (timeSinceLastRestart > 300000) {
      // 5 minutes
      logger.warn(`Restarting problematic shard ${shardId}`);
      this.restartShard(shardId);
    }
  }

  /**
   * Restart a specific shard
   */
  private async restartShard(shardId: number): Promise<void> {
    try {
      logger.info(`🔄 Restarting shard ${shardId}`);

      const shard = this.manager.shards.get(shardId);
      if (shard) {
        await shard.respawn();

        const health = this.shardHealth.get(shardId);
        if (health) {
          health.restarts++;
          health.errors = 0; // Reset error count
        }
      }
    } catch (error) {
      logger.error(`Failed to restart shard ${shardId}:`, error);
    }
  }

  /**
   * Setup Top.gg integration with enhanced error handling
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
    } catch (error) {
      logger.error("Failed to setup Top.gg autoposter:", error);
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    // Stats aggregation every 60 seconds
    this.statsInterval = setInterval(() => {
      this.aggregateGlobalStats();
    }, 60000);
  }

  /**
   * Perform comprehensive health check
   */
  private performHealthCheck(): void {
    const now = Date.now();
    let unhealthyShards = 0;

    for (const [shardId, health] of this.shardHealth.entries()) {
      const timeSinceHeartbeat = now - health.lastHeartbeat;

      // Consider shard unhealthy if no heartbeat in 2 minutes
      if (timeSinceHeartbeat > 120000) {
        unhealthyShards++;
        logger.warn(
          `Shard ${shardId} unhealthy: last heartbeat ${
            timeSinceHeartbeat / 1000
          }s ago`
        );

        // Try to get fresh stats from shard
        const shard = this.manager.shards.get(shardId);
        if (shard) {
          shard.eval("this.ws.ping").catch(() => {
            logger.warn(`Shard ${shardId} not responding to eval`);
          });
        }
      }
    }

    if (unhealthyShards > 0) {
      logger.warn(
        `Health check: ${unhealthyShards}/${this.shardHealth.size} shards unhealthy`
      );
    }
  }

  /**
   * Aggregate global statistics
   */
  private aggregateGlobalStats(): void {
    let totalGuilds = 0;
    let totalUsers = 0;
    let healthyShards = 0;
    let totalUptime = 0;
    let totalRestarts = 0;

    for (const health of this.shardHealth.values()) {
      totalGuilds += health.guilds;
      totalUsers += health.users;
      totalRestarts += health.restarts;

      if (health.status === "ready") {
        healthyShards++;
        totalUptime += health.uptime;
      }
    }

    this.globalStats = {
      totalGuilds,
      totalUsers,
      totalShards: this.shardHealth.size,
      healthyShards,
      avgUptime: healthyShards > 0 ? totalUptime / healthyShards : 0,
      totalRestarts,
      lastUpdate: Date.now(),
    };

    // Log stats periodically
    logger.info(
      `📈 Global Stats: ${totalGuilds} guilds, ${totalUsers} users across ${healthyShards}/${this.shardHealth.size} healthy shards`
    );

    this.emit("globalStatsUpdate", this.globalStats);
  }

  /**
   * Get current global statistics
   */
  public getGlobalStats(): GlobalStats {
    return { ...this.globalStats };
  }

  /**
   * Get health information for all shards
   */
  public getShardHealthMap(): Map<number, ShardHealth> {
    return new Map(this.shardHealth);
  }

  /**
   * Get health information for a specific shard
   */
  public getShardHealth(shardId: number): ShardHealth | undefined {
    return this.shardHealth.get(shardId);
  }

  /**
   * Broadcast message to all shards
   */
  public async broadcastToShards(script: (client: any) => any): Promise<any[]> {
    try {
      const results = await this.manager.broadcastEval(script);
      logger.debug(`Broadcast completed: ${results.length} responses`);
      return results;
    } catch (error) {
      logger.error("Broadcast failed:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive bot statistics
   */
  public async getBotStats(): Promise<any> {
    try {
      const results = await this.manager.broadcastEval((client) => ({
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        channels: client.channels.cache.size,
        uptime: client.uptime,
        ping: client.ws.ping,
        memory: process.memoryUsage(),
        shardId: client.shard?.ids[0],
      }));

      return {
        shards: results,
        global: this.globalStats,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error("Failed to get bot stats:", error);
      return null;
    }
  }

  /**
   * Graceful shutdown of all shards
   */
  public async shutdown(): Promise<void> {
    logger.info("🛑 Initiating graceful shutdown...");
    this.isShuttingDown = true;

    // Clear intervals
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);

    try {
      // Notify all shards of shutdown
      await this.broadcastToShards((client) => client.destroy());

      // Wait a moment for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 5000));

      logger.info("✅ Graceful shutdown completed");
    } catch (error) {
      logger.error("Error during shutdown:", error);
    }
  }

  /**
   * Start the shard manager
   */
  public async start(): Promise<void> {
    try {
      logger.info(
        `🚀 Starting SmokeyBot with 'auto' shard(s)...`
      );
      logger.info(
        `Environment: ${config.isDev ? "Development" : "Production"}`
      );
      logger.info(`Respawn: ${config.respawn ? "Enabled" : "Disabled"}`);

      const shards = await this.manager.spawn({
        amount: config.isDev ? 1 : 'auto',
        delay: 5000, // 5 second delay between spawns
        timeout: config.timeout,
      });

      logger.info(`✅ Successfully spawned ${shards.size} shard(s)`);

      // Start monitoring
      this.startHealthMonitoring();

      // Initial stats collection after 30 seconds
      setTimeout(() => this.aggregateGlobalStats(), 30000);
    } catch (error) {
      logger.error("Failed to start shard manager:", error);
      throw new ShardManagerError(
        "Shard manager startup failed",
        "STARTUP_ERROR"
      );
    }
  }
}

// Create and export enhanced shard manager
export const enhancedManager = new EnhancedShardManager();
export const manager = enhancedManager.manager; // Backward compatibility

// Setup process handlers
process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down...");
  await enhancedManager.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down...");
  await enhancedManager.shutdown();
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  process.exit(1);
});

// Start the enhanced shard manager
enhancedManager.start().catch((error) => {
  logger.error("Fatal startup error:", error);
  process.exit(1);
});

// Export utilities for external use
export { ShardManagerError };
export type { GlobalStats, ShardHealth };

