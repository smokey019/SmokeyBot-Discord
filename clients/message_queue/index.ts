import {
  EmbedBuilder,
  MessagePayload,
  TextChannel,
  type CommandInteraction,
  type Guild,
  type InteractionEditReplyOptions,
} from "discord.js";
import { getLogger } from "../logger";

const logger = getLogger("Message Queue");

// Configuration constants
const MAX_QUEUE_SIZE = 1000;
const BATCH_SIZE = 10;
const PROCESSING_INTERVAL = 100; // Process every 100ms
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base delay

// statistics interface
interface QueueStatistics {
  // Basic counters
  processed: number;
  failed: number;
  retries: number;
  queuedTotal: number;

  // Processing metrics
  totalProcessingTime: number;
  minProcessingTime: number;
  maxProcessingTime: number;
  avgProcessingTime: number;

  // Queue metrics
  totalWaitTime: number;
  minWaitTime: number;
  maxWaitTime: number;
  avgWaitTime: number;
  peakQueueSize: number;
  currentQueueSize: number;

  // Type-specific stats
  messagesByType: Record<string, {
    processed: number;
    failed: number;
    retries: number;
    avgProcessingTime: number;
  }>;

  // Priority stats
  messagesByPriority: Record<number, {
    processed: number;
    failed: number;
    avgWaitTime: number;
  }>;

  // Error tracking
  errorsByType: Record<string, number>;
  rateLimitHits: number;
  networkErrors: number;
  timeoutErrors: number;

  // Performance metrics
  throughputPerSecond: number;
  throughputPerMinute: number;
  successRate: number;

  // Timing data
  startTime: Date;
  lastProcessedAt?: Date;
  uptime: number;

  // Queue health
  processing: boolean;
  backlogThreshold: number;
  isHealthy: boolean;
}

// message interface with timing data
interface QueuedMessage {
  id: string;
  type: "interaction_reply" | "interaction_edit" | "channel_message";
  payload: any;
  priority: number;
  retries: number;
  timestamp: Date;
  queuedAt: Date;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

// Performance sample for moving averages
interface PerformanceSample {
  timestamp: Date;
  processingTime: number;
  waitTime: number;
  type: string;
  priority: number;
  success: boolean;
}

class MessageQueueManager {
  private queue: QueuedMessage[] = [];
  private processing = false;
  private timer?: Timer;
  private startTime = new Date();

  // statistics tracking
  private stats: QueueStatistics = {
    processed: 0,
    failed: 0,
    retries: 0,
    queuedTotal: 0,
    totalProcessingTime: 0,
    minProcessingTime: Infinity,
    maxProcessingTime: 0,
    avgProcessingTime: 0,
    totalWaitTime: 0,
    minWaitTime: Infinity,
    maxWaitTime: 0,
    avgWaitTime: 0,
    peakQueueSize: 0,
    currentQueueSize: 0,
    messagesByType: {},
    messagesByPriority: {},
    errorsByType: {},
    rateLimitHits: 0,
    networkErrors: 0,
    timeoutErrors: 0,
    throughputPerSecond: 0,
    throughputPerMinute: 0,
    successRate: 0,
    startTime: this.startTime,
    uptime: 0,
    processing: false,
    backlogThreshold: 50,
    isHealthy: true,
  };

  // Performance tracking
  private performanceSamples: PerformanceSample[] = [];
  private maxSamples = 1000; // Keep last 1000 samples for moving averages
  private lastThroughputUpdate = Date.now();
  private throughputCounter = 0;

  constructor() {
    this.startProcessing();
    this.startStatsUpdater();
  }

  // queue addition with better timing tracking
  private addToQueue<T>(
    type: QueuedMessage["type"],
    payload: any,
    priority = 1
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        this.updateErrorStats("QueueFullError");
        reject(new Error("Message queue is full"));
        return;
      }

      const now = new Date();
      const message: QueuedMessage = {
        id: this.generateId(),
        type,
        payload,
        priority,
        retries: 0,
        timestamp: now,
        queuedAt: now,
        resolve,
        reject,
      };

      // Insert based on priority (higher priority first)
      const insertIndex = this.queue.findIndex((m) => m.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(message);
      } else {
        this.queue.splice(insertIndex, 0, message);
      }

      // Update stats
      this.stats.queuedTotal++;
      this.stats.currentQueueSize = this.queue.length;
      this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, this.queue.length);

      // Initialize type stats if needed
      if (!this.stats.messagesByType[type]) {
        this.stats.messagesByType[type] = {
          processed: 0,
          failed: 0,
          retries: 0,
          avgProcessingTime: 0,
        };
      }

      // Initialize priority stats if needed
      if (!this.stats.messagesByPriority[priority]) {
        this.stats.messagesByPriority[priority] = {
          processed: 0,
          failed: 0,
          avgWaitTime: 0,
        };
      }

      logger.trace(`Queued ${type} message with priority ${priority} (queue size: ${this.queue.length})`);
    });
  }

  // Start the processing loop
  private startProcessing() {
    if (this.timer) return;

    this.timer = setInterval(() => {
      if (!this.processing && this.queue.length > 0) {
        this.processQueue();
      }
    }, PROCESSING_INTERVAL);
  }

  // Start periodic stats updates
  private startStatsUpdater() {
    setInterval(() => {
      this.updateDerivedStats();
    }, 1000); // Update every second
  }

  // Update derived statistics
  private updateDerivedStats() {
    const now = Date.now();
    this.stats.uptime = now - this.startTime.getTime();
    this.stats.processing = this.processing;
    this.stats.currentQueueSize = this.queue.length;

    // Calculate success rate
    const totalAttempts = this.stats.processed + this.stats.failed;
    this.stats.successRate = totalAttempts > 0 ? (this.stats.processed / totalAttempts) * 100 : 100;

    // Calculate throughput
    const timeSinceLastUpdate = now - this.lastThroughputUpdate;
    if (timeSinceLastUpdate >= 1000) {
      this.stats.throughputPerSecond = this.throughputCounter / (timeSinceLastUpdate / 1000);
      this.stats.throughputPerMinute = this.stats.throughputPerSecond * 60;
      this.throughputCounter = 0;
      this.lastThroughputUpdate = now;
    }

    // Update health status
    this.stats.isHealthy = this.queue.length < this.stats.backlogThreshold &&
                          this.stats.successRate > 95;

    // Clean old performance samples
    const cutoff = new Date(now - 300000); // Keep last 5 minutes
    this.performanceSamples = this.performanceSamples.filter(s => s.timestamp > cutoff);
  }

  // processing with timing
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const processingStartTime = performance.now();

    try {
      // Process up to BATCH_SIZE messages
      const batch = this.queue.splice(
        0,
        Math.min(BATCH_SIZE, this.queue.length)
      );

      this.stats.currentQueueSize = this.queue.length;

      // Process messages concurrently within the batch
      const promises = batch.map((message) => this.processMessage(message));
      await Promise.allSettled(promises);

    } catch (error) {
      logger.error("Error processing message queue batch:", error);
      this.updateErrorStats("BatchProcessingError");
    } finally {
      this.processing = false;

      // Track batch processing time
      const batchTime = performance.now() - processingStartTime;
      this.addPerformanceSample({
        timestamp: new Date(),
        processingTime: batchTime,
        waitTime: 0,
        type: "batch",
        priority: 0,
        success: true,
      });
    }
  }

  // message processing with detailed timing
  private async processMessage(message: QueuedMessage) {
    const processStart = performance.now();
    const waitTime = processStart - message.queuedAt.getTime();
    let success = false;

    try {
      let result: any;

      switch (message.type) {
        case "interaction_reply":
          result = await this.handleInteractionReply(message.payload);
          break;
        case "interaction_edit":
          result = await this.handleInteractionEdit(message.payload);
          break;
        case "channel_message":
          result = await this.handleChannelMessage(message.payload);
          break;
        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }

      const processingTime = performance.now() - processStart;
      success = true;

      // Update success stats
      this.updateSuccessStats(message, processingTime, waitTime);

      message.resolve(result);
      this.throughputCounter++;

    } catch (error) {
      const processingTime = performance.now() - processStart;
      this.addPerformanceSample({
        timestamp: new Date(),
        processingTime,
        waitTime,
        type: message.type,
        priority: message.priority,
        success: false,
      });

      await this.handleMessageError(message, error);
    }
  }

  // Update statistics for successful message processing
  private updateSuccessStats(message: QueuedMessage, processingTime: number, waitTime: number) {
    this.stats.processed++;
    this.stats.lastProcessedAt = new Date();

    // Update processing time stats
    this.stats.totalProcessingTime += processingTime;
    this.stats.minProcessingTime = Math.min(this.stats.minProcessingTime, processingTime);
    this.stats.maxProcessingTime = Math.max(this.stats.maxProcessingTime, processingTime);
    this.stats.avgProcessingTime = this.stats.totalProcessingTime / this.stats.processed;

    // Update wait time stats
    this.stats.totalWaitTime += waitTime;
    this.stats.minWaitTime = Math.min(this.stats.minWaitTime, waitTime);
    this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, waitTime);
    this.stats.avgWaitTime = this.stats.totalWaitTime / this.stats.processed;

    // Update type-specific stats
    const typeStats = this.stats.messagesByType[message.type];
    typeStats.processed++;
    typeStats.avgProcessingTime = (
      (typeStats.avgProcessingTime * (typeStats.processed - 1) + processingTime) / typeStats.processed
    );

    // Update priority-specific stats
    const priorityStats = this.stats.messagesByPriority[message.priority];
    priorityStats.processed++;
    priorityStats.avgWaitTime = (
      (priorityStats.avgWaitTime * (priorityStats.processed - 1) + waitTime) / priorityStats.processed
    );

    // Add performance sample
    this.addPerformanceSample({
      timestamp: new Date(),
      processingTime,
      waitTime,
      type: message.type,
      priority: message.priority,
      success: true,
    });
  }

  // error handling with categorization
  private async handleMessageError(message: QueuedMessage, error: any) {
    message.retries++;
    this.stats.retries++;

    // Categorize error
    this.categorizeError(error);

    // Update type-specific retry stats
    this.stats.messagesByType[message.type].retries++;

    if (message.retries < MAX_RETRIES && this.isRetryableError(error)) {
      logger.debug(
        `Retrying message ${message.id}, attempt ${message.retries + 1}`
      );

      // Exponential backoff
      const delay = RETRY_DELAY * Math.pow(2, message.retries - 1);
      const timer = setTimeout(() => {
        // Re-add to queue with lower priority
        message.priority = Math.max(0, message.priority - 1);
        message.queuedAt = new Date(); // Reset queue time for accurate wait time calculation
        this.queue.unshift(message);
        clearTimeout(timer);
      }, delay);
    } else {
      logger.error(
        `Failed to process message ${message.id} after ${message.retries} retries:`,
        error
      );

      // Update failure stats
      this.stats.failed++;
      this.stats.messagesByType[message.type].failed++;
      this.stats.messagesByPriority[message.priority].failed++;

      message.reject(error);
    }
  }

  // Categorize errors for better statistics
  private categorizeError(error: any) {
    const message = error.message?.toLowerCase() || "";

    if (message.includes("rate limit")) {
      this.stats.rateLimitHits++;
      this.updateErrorStats("RateLimitError");
    } else if (message.includes("network") || message.includes("503") || message.includes("502")) {
      this.stats.networkErrors++;
      this.updateErrorStats("NetworkError");
    } else if (message.includes("timeout")) {
      this.stats.timeoutErrors++;
      this.updateErrorStats("TimeoutError");
    } else {
      this.updateErrorStats("UnknownError");
    }
  }

  // Update error statistics
  private updateErrorStats(errorType: string) {
    if (!this.stats.errorsByType[errorType]) {
      this.stats.errorsByType[errorType] = 0;
    }
    this.stats.errorsByType[errorType]++;
  }

  // Add performance sample
  private addPerformanceSample(sample: PerformanceSample) {
    this.performanceSamples.push(sample);

    // Keep only recent samples
    if (this.performanceSamples.length > this.maxSamples) {
      this.performanceSamples = this.performanceSamples.slice(-this.maxSamples);
    }
  }

  // Check if error is worth retrying
  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || "";
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("rate limit") ||
      message.includes("503") ||
      message.includes("502")
    );
  }

  // Generate unique message ID
  private generateId(): string {
    return `msg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }

  // Handle interaction reply
  private async handleInteractionReply(payload: {
    interaction: CommandInteraction;
    message: string | MessagePayload | InteractionEditReplyOptions;
  }) {
    const { interaction, message } = payload;

    if (interaction.replied || interaction.deferred) {
      throw new Error("Interaction already replied or deferred");
    }

    return await interaction.reply(message);
  }

  // Handle interaction edit
  private async handleInteractionEdit(payload: {
    interaction: CommandInteraction;
    message: string | MessagePayload | InteractionEditReplyOptions;
  }) {
    const { interaction, message } = payload;

    if (!interaction.replied && !interaction.deferred) {
      throw new Error("Interaction not replied or deferred yet");
    }

    return await interaction.editReply(message);
  }

  // Handle channel message
  private async handleChannelMessage(payload: {
    guild: Guild;
    channelName: string;
    content: { embeds?: EmbedBuilder[]; content?: string };
  }) {
    const { guild, channelName, content } = payload;

    const channel = guild.channels.cache.find(
      (ch): ch is TextChannel =>
        ch.name === channelName && ch.isTextBased() && "send" in ch
    ) as TextChannel;

    if (!channel) {
      throw new Error(
        `Channel "${channelName}" not found in guild ${guild.name}`
      );
    }

    return await channel.send(content);
  }

  // Public methods for adding messages to queue (unchanged for backwards compatibility)
  async queueInteractionReply(
    interaction: CommandInteraction,
    message: string | MessagePayload | InteractionEditReplyOptions,
    priority = 2
  ): Promise<any> {
    return this.addToQueue(
      "interaction_reply",
      { interaction, message },
      priority
    );
  }

  async queueInteractionEdit(
    interaction: CommandInteraction,
    message: string | MessagePayload | InteractionEditReplyOptions,
    priority = 2
  ): Promise<any> {
    return this.addToQueue(
      "interaction_edit",
      { interaction, message },
      priority
    );
  }

  async queueChannelMessage(
    guild: Guild,
    channelName: string,
    content: { embeds?: EmbedBuilder[]; content?: string },
    priority = 1
  ): Promise<any> {
    return this.addToQueue(
      "channel_message",
      { guild, channelName, content },
      priority
    );
  }

  // Get comprehensive statistics
  getStats(): QueueStatistics {
    this.updateDerivedStats();
    return { ...this.stats };
  }

  // Get performance samples for detailed analysis
  getPerformanceSamples(): PerformanceSample[] {
    return [...this.performanceSamples];
  }

  // Reset statistics (useful for testing)
  resetStats() {
    const now = new Date();
    this.stats = {
      processed: 0,
      failed: 0,
      retries: 0,
      queuedTotal: 0,
      totalProcessingTime: 0,
      minProcessingTime: Infinity,
      maxProcessingTime: 0,
      avgProcessingTime: 0,
      totalWaitTime: 0,
      minWaitTime: Infinity,
      maxWaitTime: 0,
      avgWaitTime: 0,
      peakQueueSize: 0,
      currentQueueSize: this.queue.length,
      messagesByType: {},
      messagesByPriority: {},
      errorsByType: {},
      rateLimitHits: 0,
      networkErrors: 0,
      timeoutErrors: 0,
      throughputPerSecond: 0,
      throughputPerMinute: 0,
      successRate: 0,
      startTime: now,
      uptime: 0,
      processing: this.processing,
      backlogThreshold: 50,
      isHealthy: true,
    };
    this.startTime = now;
    this.performanceSamples = [];
    this.throughputCounter = 0;
    this.lastThroughputUpdate = Date.now();
  }

  // Clean up resources
  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.queue.length = 0;
  }
}

// Global message queue instance
const messageQueue = new MessageQueueManager();

// ==================== PUBLIC API (Backwards Compatible) ====================

/**
 * message sending with proper queue management
 * @param message Message content
 * @param interaction Discord interaction
 * @param edit Whether to edit existing reply or send new one
 * @param priority Message priority (higher = processed first)
 */
export async function queueMessage(
  message: string | MessagePayload | InteractionEditReplyOptions,
  interaction: CommandInteraction,
  edit = false,
  priority = 2
): Promise<void> {
  try {
    if (edit) {
      await messageQueue.queueInteractionEdit(interaction, message, priority);
    } else {
      await messageQueue.queueInteractionReply(interaction, message, priority);
    }
  } catch (error) {
    logger.error("Failed to queue message:", error);

    // Fallback: try direct send (bypass queue)
    try {
      if (edit) {
        await interaction.editReply(message);
      } else {
        await interaction.reply(message);
      }
    } catch (fallbackError) {
      logger.error("Fallback message send also failed:", fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Send message to pokémon-spawns channel only (no fallbacks)
 * @param embed Embed to send
 * @param interaction Discord interaction for context
 * @param priority Message priority
 */
export async function spawnChannelMessage(
  embed: EmbedBuilder,
  interaction: CommandInteraction,
  priority = 1
): Promise<void> {
  if (!interaction.guild) {
    throw new Error("No guild context available");
  }

  await messageQueue.queueChannelMessage(
    interaction.guild,
    "pokémon-spawns",
    { embeds: [embed] },
    priority
  );
}

/**
 * Send high priority message (processes immediately)
 */
export async function sendUrgentMessage(
  message: string | MessagePayload | InteractionEditReplyOptions,
  interaction: CommandInteraction,
  edit = false
): Promise<void> {
  return queueMessage(message, interaction, edit, 10); // Highest priority
}

/**
 * Get comprehensive message queue statistics for monitoring
 * @returns Complete statistics object with all metrics
 */
export function getMessageQueueStats(): QueueStatistics {
  return messageQueue.getStats();
}

/**
 * Get detailed performance samples for analysis
 * @returns Array of performance samples
 */
export function getMessageQueuePerformance(): PerformanceSample[] {
  return messageQueue.getPerformanceSamples();
}

/**
 * Get health status and recent errors for reporting
 */
export function getQueueHealth(): {
  status: string;
  queueBacklog: boolean;
  successRate: number;
  recentErrors: Array<[string, number]>;
} {
  const stats = messageQueue.getStats();
  return {
    status: stats.isHealthy ? "healthy" : "unhealthy",
    queueBacklog: stats.currentQueueSize >= stats.backlogThreshold,
    successRate: stats.successRate,
    recentErrors: Object.entries(stats.errorsByType)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5),
  };
}

/**
 * Format duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Reset queue statistics (useful for testing)
 */
export function resetMessageQueueStats(): void {
  messageQueue.resetStats();
}

/**
 * Gracefully shutdown the message queue
 */
export function shutdownMessageQueue(): void {
  messageQueue.destroy();
}

// Export the queue manager for advanced usage
export { messageQueue, type PerformanceSample, type QueueStatistics };

