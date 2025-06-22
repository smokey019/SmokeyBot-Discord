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

// Message types for the queue
interface QueuedMessage {
  id: string;
  type: "interaction_reply" | "interaction_edit" | "channel_message";
  payload: any;
  priority: number;
  retries: number;
  timestamp: Date;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class MessageQueueManager {
  private queue: QueuedMessage[] = [];
  private processing = false;
  private timer?: Timer;
  private stats = {
    processed: 0,
    failed: 0,
    retries: 0,
    queuedTotal: 0,
  };

  constructor() {
    this.startProcessing();
  }

  // Add message to queue with priority support
  private addToQueue<T>(
    type: QueuedMessage["type"],
    payload: any,
    priority = 1
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        reject(new Error("Message queue is full"));
        return;
      }

      const message: QueuedMessage = {
        id: this.generateId(),
        type,
        payload,
        priority,
        retries: 0,
        timestamp: new Date(),
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

      this.stats.queuedTotal++;
      logger.trace(`Queued ${type} message with priority ${priority}`);
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

  // Process messages in batches
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    try {
      // Process up to BATCH_SIZE messages
      const batch = this.queue.splice(
        0,
        Math.min(BATCH_SIZE, this.queue.length)
      );

      // Process messages concurrently within the batch
      const promises = batch.map((message) => this.processMessage(message));
      await Promise.allSettled(promises);
    } catch (error) {
      logger.error("Error processing message queue batch:", error);
    } finally {
      this.processing = false;
    }
  }

  // Process individual message
  private async processMessage(message: QueuedMessage) {
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

      message.resolve(result);
      this.stats.processed++;
    } catch (error) {
      await this.handleMessageError(message, error);
    }
  }

  // Handle message processing errors with retry logic
  private async handleMessageError(message: QueuedMessage, error: any) {
    message.retries++;
    this.stats.retries++;

    if (message.retries < MAX_RETRIES && this.isRetryableError(error)) {
      logger.debug(
        `Retrying message ${message.id}, attempt ${message.retries + 1}`
      );

      // Exponential backoff using Bun's timer
      const delay = RETRY_DELAY * Math.pow(2, message.retries - 1);
      const timer = setTimeout(() => {
        // Re-add to queue with lower priority to process other messages first
        message.priority = Math.max(0, message.priority - 1);
        this.queue.unshift(message);
        clearTimeout(timer);
      }, delay);
    } else {
      logger.error(
        `Failed to process message ${message.id} after ${message.retries} retries:`,
        error
      );
      message.reject(error);
      this.stats.failed++;
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

  // Generate unique message ID using Bun's crypto
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

  // Public methods for adding messages to queue
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

  // Get queue statistics
  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      processing: this.processing,
    };
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

/**
 * Enhanced message sending with proper queue management
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
 * Get message queue statistics for monitoring
 */
export function getMessageQueueStats() {
  return messageQueue.getStats();
}

/**
 * Gracefully shutdown the message queue
 */
export function shutdownMessageQueue() {
  messageQueue.destroy();
}

// Export the queue manager for advanced usage
export { messageQueue };

