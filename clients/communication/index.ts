import { createClient } from "redis";
import { WebSocket, WebSocketServer } from "ws";
import { getLogger } from "../logger";

const logger = getLogger("Communication");

// Interfaces for communication
export interface InterShardMessage {
  type: string;
  fromShard?: number;
  toShard?: number | "all";
  data: any;
  timestamp: number;
  id: string;
}

export interface CommunicationManager {
  initialize(): Promise<void>;
  send(message: InterShardMessage): Promise<void>;
  broadcast(message: InterShardMessage): Promise<void>;
  sendToShard(shardId: number, message: InterShardMessage): Promise<void>;
  subscribe(callback: (message: InterShardMessage) => void): void;
  unsubscribe(callback: (message: InterShardMessage) => void): void;
  close(): Promise<void>;
  isConnected(): boolean;
}

// Configuration constants
const WEBSOCKET_RECONNECT_DELAY = 5000;
const WEBSOCKET_RETRY_DELAY = 1000;

// ============================================================================
// REDIS COMMUNICATION MANAGER
// ============================================================================

export class RedisCommunicationManager implements CommunicationManager {
  private client?: ReturnType<typeof createClient>;
  private subscriber?: ReturnType<typeof createClient>;
  private callbacks: Array<(message: InterShardMessage) => void> = [];
  private connected = false;
  private redisUrl: string;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
  }

  async initialize(): Promise<void> {
    try {
      this.client = createClient({ url: this.redisUrl });
      this.subscriber = createClient({ url: this.redisUrl });

      await this.client.connect();
      await this.subscriber.connect();

      // Subscribe to broadcast channel
      await this.subscriber.subscribe("shard-manager", (message) => {
        this.handleMessage(message);
      });

      // Subscribe to broadcast channel for shards
      await this.subscriber.subscribe("shard-broadcast", (message) => {
        this.handleMessage(message);
      });

      this.connected = true;
      logger.info("✅ Redis communication manager initialized");
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

  async broadcast(message: InterShardMessage): Promise<void> {
    message.toShard = "all";
    await this.send(message);
  }

  async sendToShard(shardId: number, message: InterShardMessage): Promise<void> {
    message.toShard = shardId;
    await this.send(message);
  }

  subscribe(callback: (message: InterShardMessage) => void): void {
    this.callbacks.push(callback);
  }

  unsubscribe(callback: (message: InterShardMessage) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    this.connected = false;
    this.callbacks = [];

    if (this.client) {
      await this.client.disconnect();
    }
    if (this.subscriber) {
      await this.subscriber.disconnect();
    }
  }
}

// ============================================================================
// WEBSOCKET COMMUNICATION MANAGER
// ============================================================================

export class WebSocketCommunicationManager implements CommunicationManager {
  private ws?: WebSocket;
  private callbacks: Array<(message: InterShardMessage) => void> = [];
  private connected = false;
  private reconnectTimer?: Timer;
  private wsManagerUrl: string;
  private shardId?: number;

  constructor(wsManagerUrl: string, shardId?: number) {
    this.wsManagerUrl = wsManagerUrl;
    this.shardId = shardId;
  }

  async initialize(): Promise<void> {
    return this.tryConnectWithFallback(this.wsManagerUrl);
  }

  private async tryConnectWithFallback(
    baseUrl: string,
    attemptedPorts: number[] = []
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = this.shardId !== undefined
          ? `${baseUrl}?shardId=${this.shardId}`
          : baseUrl;

        // Clean up previous WebSocket if exists
        if (this.ws) {
          this.ws.removeAllListeners();
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
          }
        }

        this.ws = new WebSocket(url);
        const currentPort = parseInt(baseUrl.split(":").pop() || "8081");
        attemptedPorts.push(currentPort);

        this.ws.on("open", () => {
          this.connected = true;
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
          logger.warn(
            `WebSocket disconnected (code: ${code}, reason: ${reason || "unknown"}), attempting reconnect...`
          );
          this.scheduleReconnect();
        });

        this.ws.on("error", (error: any) => {
          const errorDetails = {
            message: error.message || "Unknown error",
            code: error.code || "No code",
            errno: error.errno || "No errno",
            port: currentPort,
            type: error.constructor.name,
          };

          logger.error(`WebSocket error details:`, errorDetails);

          // Try fallback ports in development (max 5 attempts)
          if (!this.connected && process.env.DEV === "true") {
            const fallbackPorts = [8082, 8083, 8084, 8085, 8086].filter(
              (p) => !attemptedPorts.includes(p)
            );

            if (fallbackPorts.length > 0 && attemptedPorts.length < 5) {
              const nextPort = fallbackPorts[0];
              const fallbackUrl = baseUrl.replace(/:\d+$/, `:${nextPort}`);
              logger.warn(
                `⚠️ WebSocket connection failed on port ${currentPort}, trying fallback port ${nextPort} (attempt ${attemptedPorts.length + 1}/5)`
              );

              // Clean up current WebSocket before trying next
              if (this.ws) {
                this.ws.removeAllListeners();
              }

              setTimeout(() => {
                this.tryConnectWithFallback(fallbackUrl, attemptedPorts)
                  .then(resolve)
                  .catch(reject);
              }, WEBSOCKET_RETRY_DELAY);
              return;
            } else {
              logger.error(
                `❌ All fallback ports exhausted. Attempted ports: ${attemptedPorts.join(", ")}`
              );
              logger.info(
                `💡 For local development, you can disable WebSocket with USE_WEBSOCKET=false in your environment`
              );
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
    }, WEBSOCKET_RECONNECT_DELAY);
  }

  async send(message: InterShardMessage): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error("WebSocket not connected");
    }

    this.ws.send(JSON.stringify(message));
  }

  async broadcast(message: InterShardMessage): Promise<void> {
    message.toShard = "all";
    await this.send(message);
  }

  async sendToShard(shardId: number, message: InterShardMessage): Promise<void> {
    message.toShard = shardId;
    await this.send(message);
  }

  subscribe(callback: (message: InterShardMessage) => void): void {
    this.callbacks.push(callback);
  }

  unsubscribe(callback: (message: InterShardMessage) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    this.connected = false;
    this.callbacks = [];

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

// ============================================================================
// WEBSOCKET SERVER (FOR SHARD MANAGER)
// ============================================================================

export class WebSocketServerCommunicationManager implements CommunicationManager {
  private server?: WebSocketServer;
  private clients = new Map<number, WebSocket>();
  private callbacks: Array<(message: InterShardMessage) => void> = [];
  private actualPort?: number;
  private wsPort: number;
  private devFallbackPorts: number[];

  constructor(wsPort: number, devFallbackPorts: number[] = [8082, 8083, 8084, 8085]) {
    this.wsPort = wsPort;
    this.devFallbackPorts = devFallbackPorts;
  }

  async initialize(): Promise<void> {
    return this.tryInitializeWithFallback(this.wsPort);
  }

  private async tryInitializeWithFallback(
    port: number,
    attemptedPorts: number[] = []
  ): Promise<void> {
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
          verifyClient: () => true, // Add authentication logic here if needed
        });

        this.server.on("error", (error: any) => {
          const errorDetails = {
            message: error.message || "Unknown error",
            code: error.code || "No code",
            errno: error.errno || "No errno",
            port: port,
            type: error.constructor.name,
          };

          logger.error(`WebSocket server error details:`, errorDetails);

          if (error.code === "EADDRINUSE" && process.env.DEV === "true") {
            // Try fallback ports in development (max 5 attempts)
            const fallbackPorts = this.devFallbackPorts.filter(
              (p) => !attemptedPorts.includes(p)
            );
            if (fallbackPorts.length > 0 && attemptedPorts.length < 5) {
              const nextPort = fallbackPorts[0];
              logger.warn(
                `⚠️ Port ${port} in use, trying fallback port ${nextPort} (attempt ${attemptedPorts.length + 1}/5)`
              );

              setTimeout(() => {
                this.tryInitializeWithFallback(nextPort, attemptedPorts)
                  .then(resolve)
                  .catch(reject);
              }, 500); // Small delay between server startup attempts
              return;
            } else {
              logger.error(
                `❌ All fallback ports exhausted. Attempted ports: ${attemptedPorts.join(", ")}`
              );
              logger.info(
                `💡 For local development, you can disable WebSocket with USE_WEBSOCKET=false in your environment`
              );
            }
          }

          if (error.code === "EADDRINUSE") {
            logger.error(
              `❌ Port ${port} is already in use. Try setting WS_PORT to a different port or disable WebSocket communication.`
            );
            logger.info(
              `💡 For development, you can set WS_PORT=8082 or disable with USE_WEBSOCKET=false`
            );
          }
          reject(error);
        });

        this.actualPort = port;

        this.server.on("connection", (ws, req) => {
          const shardId = parseInt(
            new URL(req.url!, `http://${req.headers.host}`).searchParams.get(
              "shardId"
            ) || "-1"
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
            `✅ WebSocket communication server listening on port ${this.actualPort}`
          );
          if (process.env.DEV === "true" && this.actualPort !== this.wsPort) {
            logger.info(
              `👨‍💻 Dev mode: Using fallback port ${this.actualPort} (original ${this.wsPort} was in use)`
            );
          } else if (process.env.DEV === "true") {
            logger.info(
              `👨‍💻 Dev mode: Using port ${this.actualPort} (default dev port is 8081)`
            );
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async send(message: InterShardMessage): Promise<void> {
    const messageStr = JSON.stringify(message);

    if (message.toShard === "all") {
      // Broadcast to all clients
      for (const [shardId, ws] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(messageStr);
          } catch (error) {
            logger.error(`Failed to send message to shard ${shardId}:`, error);
          }
        }
      }
    } else if (typeof message.toShard === "number") {
      // Send to specific shard
      const ws = this.clients.get(message.toShard);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      } else {
        throw new Error(`Shard ${message.toShard} not connected via WebSocket`);
      }
    }
  }

  async broadcast(message: InterShardMessage): Promise<void> {
    message.toShard = "all";
    await this.send(message);
  }

  async sendToShard(shardId: number, message: InterShardMessage): Promise<void> {
    message.toShard = shardId;
    await this.send(message);
  }

  subscribe(callback: (message: InterShardMessage) => void): void {
    this.callbacks.push(callback);
  }

  unsubscribe(callback: (message: InterShardMessage) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  isConnected(): boolean {
    return this.server !== undefined;
  }

  async close(): Promise<void> {
    this.callbacks = [];

    if (this.server) {
      this.clients.forEach((ws) => ws.close());
      this.clients.clear();
      this.server.close();
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a Redis communication manager for shard client
 */
export function createRedisManager(redisUrl: string): RedisCommunicationManager {
  return new RedisCommunicationManager(redisUrl);
}

/**
 * Create a WebSocket client communication manager for shard client
 */
export function createWebSocketClientManager(
  wsManagerUrl: string,
  shardId?: number
): WebSocketCommunicationManager {
  return new WebSocketCommunicationManager(wsManagerUrl, shardId);
}

/**
 * Create a WebSocket server communication manager for shard manager
 */
export function createWebSocketServerManager(
  wsPort: number,
  devFallbackPorts?: number[]
): WebSocketServerCommunicationManager {
  return new WebSocketServerCommunicationManager(wsPort, devFallbackPorts);
}
