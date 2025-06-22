import { Collection, CommandInteraction } from "discord.js";
import type {
  SevenTVChannel,
  SevenTVChannelEmotes,
  SevenTVEmotes,
} from "../../models/7tv-Emotes";
import type { FFZRoom } from "../../models/FFZ-Emotes";
import { jsonFetch } from "../../utils";
import { getLogger } from "../logger";
import { getIDwithUser } from "../twitch";

// Configuration constants
const QUEUE_PROCESSING_INTERVAL = 3000; // 3 seconds instead of 1.5
const MAX_CONCURRENT_UPLOADS = 3; // Allow multiple uploads simultaneously
const RATE_LIMIT_DELAY = 1000; // 1 second between API calls
const MAX_RETRIES = 3;

const logger = getLogger("Emote Queue");

// Centralized stats tracking
interface QueueStats {
  attempts: number;
  successes: number;
  ffzAttempts: number;
  ffzSuccesses: number;
}

const stats: QueueStats = {
  attempts: 0,
  successes: 0,
  ffzAttempts: 0,
  ffzSuccesses: 0,
};

// Improved queue data structure
interface QueueData {
  emotes: Collection<string, string>;
  successes: number;
  failures: number;
  removed: number;
  interaction: CommandInteraction;
  priority: number; // Add priority system
  createdAt: Date;
}

// Global state management
class EmoteQueueManager {
  private queue: Collection<string, QueueData> = new Collection();
  private timer?: Timer;
  private isProcessing = false;
  private rateLimitMap = new Map<string, number>(); // Track API rate limits

  // Getter for queue access
  get EmoteQueue() {
    return this.queue;
  }

  // Add with priority support
  addToQueue(guildId: string, data: QueueData) {
    data.createdAt = new Date();
    this.queue.set(guildId, data);
    this.startTimer();
  }

  // Remove from queue
  removeFromQueue(guildId: string): boolean {
    const removed = this.queue.delete(guildId);
    if (this.queue.size === 0) {
      this.stopTimer();
    }
    return removed;
  }

  // Check if guild is in queue
  hasGuild(guildId: string): boolean {
    return this.queue.has(guildId);
  }

  // Get queue data for guild
  getQueueData(guildId: string): QueueData | undefined {
    return this.queue.get(guildId);
  }

  // Get queue size
  get size(): number {
    return this.queue.size;
  }

  // Start processing timer
  private startTimer() {
    if (!this.timer) {
      this.timer = setInterval(
        () => this.processQueue(),
        QUEUE_PROCESSING_INTERVAL
      );
    }
  }

  // Stop processing timer
  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  // Process queue with concurrency control
  private async processQueue() {
    if (this.isProcessing || this.queue.size === 0) return;

    this.isProcessing = true;

    try {
      // Get up to MAX_CONCURRENT_UPLOADS guilds to process
      const guildsToProcess = Array.from(this.queue.keys())
        .slice(0, MAX_CONCURRENT_UPLOADS)
        .map((guildId) => ({ guildId, data: this.queue.get(guildId)! }))
        .sort((a, b) => b.data.priority - a.data.priority); // Process high priority first

      const processPromises = guildsToProcess.map(({ guildId, data }) =>
        this.processGuildQueue(guildId, data)
      );

      await Promise.allSettled(processPromises);
    } finally {
      this.isProcessing = false;
    }
  }

  // Process individual guild queue
  private async processGuildQueue(guildId: string, data: QueueData) {
    if (data.emotes.size === 0) {
      await this.completeGuildQueue(guildId, data);
      return;
    }

    // Check rate limit for this guild
    const lastApiCall = this.rateLimitMap.get(guildId) || 0;
    const now = Date.now();
    if (now - lastApiCall < RATE_LIMIT_DELAY) {
      return; // Skip this iteration due to rate limit
    }

    const emote = data.emotes.firstKey()!;
    const url = data.emotes.first()!;

    const success = await this.createEmojiWithRetry(url, emote, data);
    data.emotes.delete(emote);
    this.rateLimitMap.set(guildId, now);

    if (success) {
      data.successes++;
      stats.successes++;
    } else if (this.queue.has(guildId)) {
      data.failures++;
    }

    if (data.emotes.size === 0) {
      await this.completeGuildQueue(guildId, data);
    }
  }

  // Complete guild queue processing
  private async completeGuildQueue(guildId: string, data: QueueData) {
    try {
      await data.interaction.editReply(
        `✅ **Emote sync complete!**\n` +
          `📊 **Results:**\n` +
          `• ✅ Successful: ${data.successes}\n` +
          `• ❌ Failures: ${data.failures}\n` +
          `• 🔄 Skipped (existing): ${data.removed}`
      );
    } catch (error) {
      logger.error(
        `Failed to send completion message for guild ${guildId}:`,
        error
      );
    }

    this.removeFromQueue(guildId);
  }

  // Create emoji with retry logic
  private async createEmojiWithRetry(
    emoteUrl: string,
    name: string,
    data: QueueData,
    attempt = 1
  ): Promise<boolean> {
    try {
      return await this.createEmoji(emoteUrl, name, data);
    } catch (error) {
      if (attempt < MAX_RETRIES && this.isRetryableError(error)) {
        logger.debug(
          `Retrying emoji creation for ${name}, attempt ${attempt + 1}`
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000)); // Exponential backoff
        return this.createEmojiWithRetry(emoteUrl, name, data, attempt + 1);
      }

      logger.error(
        `Failed to create emoji ${name} after ${attempt} attempts:`,
        error
      );
      return false;
    }
  }

  // Check if error is retryable
  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || "";
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("rate limit")
    );
  }

  // Optimized emoji creation
  private async createEmoji(
    emoteUrl: string,
    name: string,
    data: QueueData
  ): Promise<boolean> {
    if (!data.interaction.guild || !this.queue.has(data.interaction.guild.id)) {
      return false;
    }

    logger.trace(`Creating emoji ${name} in ${data.interaction.guild.name}`);

    try {
      const emoji = await data.interaction.guild.emojis.create({
        attachment: emoteUrl,
        name: name,
      });

      logger.debug(`Created emoji ${emoji.name} in ${emoji.guild.name}`);

      // Only update interaction occasionally to reduce API calls
      if (data.successes % 5 === 0) {
        // Update every 5 successful uploads
        await data.interaction
          .editReply(`🚀 **Uploading emotes...** (${data.successes} completed)`)
          .catch(() => {}); // Ignore interaction update failures
      }

      return true;
    } catch (error) {
      return this.handleEmojiCreationError(error, name, data);
    }
  }

  // Centralized error handling
  private async handleEmojiCreationError(
    error: any,
    name: string,
    data: QueueData
  ): Promise<boolean> {
    const message = error.message || "";

    if (message.includes("Failed to resize asset")) {
      logger.debug(`Emote ${name} is too large`);
      await data.interaction
        .editReply(
          `⚠️ **${name}** is too large. Try the 1x version: [View Emote](${data.emotes.get(
            name
          )})`
        )
        .catch(() => {});
      return false;
    }

    if (message.includes("Maximum number")) {
      logger.debug(`Maximum emotes reached in ${data.interaction.guild?.name}`);
      await data.interaction
        .editReply(
          `❌ **Server emote limit reached!** Free up some emote slots and try again.`
        )
        .catch(() => {});
      this.removeFromQueue(data.interaction.guild!.id);
      return false;
    }

    if (message.includes("Missing Permissions")) {
      logger.debug(`Missing permissions in ${data.interaction.guild?.name}`);
      await data.interaction
        .editReply(
          `❌ **Missing permissions!** Please give SmokeyBot the "Manage Emojis and Stickers" permission.`
        )
        .catch(() => {});
      this.removeFromQueue(data.interaction.guild!.id);
      return false;
    }

    logger.error(`Emoji creation error for ${name}:`, error);
    return false;
  }

  // Admin functions
  async resetTimer(interaction: CommandInteraction): Promise<void> {
    this.stopTimer();
    this.startTimer();
    await interaction.editReply("✅ Timer restarted!");
  }

  async startTimerAdmin(interaction: CommandInteraction): Promise<void> {
    if (this.timer) {
      await interaction.editReply("⚠️ Timer already running!");
    } else {
      this.startTimer();
      await interaction.editReply("✅ Timer started!");
    }
  }

  // Get comprehensive stats
  getStats() {
    return {
      ...stats,
      queueSize: this.queue.size,
      isProcessing: this.isProcessing,
      activeGuilds: Array.from(this.queue.keys()),
    };
  }
}

// Global queue manager instance
const queueManager = new EmoteQueueManager();

// Export legacy interface for compatibility
export const EmoteQueue = queueManager.EmoteQueue;
export const queue_attempts = stats.attempts;
export const queue_add_success = stats.successes;
export const FFZ_emoji_queue_count = stats.ffzSuccesses;
export const FFZ_emoji_queue_attempt_count = stats.ffzAttempts;

// API functions with caching and optimization
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function cachedFetch<T>(
  url: string,
  cacheKey: string
): Promise<T | null> {
  const cached = apiCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    logger.debug(`Using cached data for ${cacheKey}`);
    return cached.data;
  }

  try {
    const data = await jsonFetch(url);
    apiCache.set(cacheKey, { data, timestamp: now });
    return data;
  } catch (error) {
    logger.error(`API fetch failed for ${url}:`, error);
    return null;
  }
}

export async function fetch7tvGlobalEmotes(): Promise<SevenTVEmotes[]> {
  const data = await cachedFetch<SevenTVEmotes[]>(
    "https://7tv.io/v3/emote-sets/global",
    "7tv_global"
  );
  return data || [];
}

export async function fetch7tvChannelEmotes(
  channel: string
): Promise<SevenTVChannel[]> {
  stats.attempts++;
  const data = await cachedFetch<SevenTVChannel[]>(
    `https://7tv.io/v3/users/twitch/${channel}`,
    `7tv_${channel}`
  );
  return data || [];
}

// Optimized sync functions
export async function sync_7tv_emotes(
  interaction: CommandInteraction
): Promise<void> {
  const channel = await getIDwithUser(interaction.options.getString("channel"));

  if (!channel || queueManager.hasGuild(interaction.guild!.id)) {
    if (queueManager.hasGuild(interaction.guild!.id)) {
      const currentQueue = queueManager.getQueueData(interaction.guild!.id)!;
      await interaction.editReply(
        `⚠️ You already have ${currentQueue.emotes.size} emotes queued!`
      );
    }
    return;
  }

  await interaction.editReply(`🔍 Checking 7TV for **${channel}** emotes...`);

  logger.debug(
    `Fetching 7TV emotes for ${channel} (${interaction.user.username} in ${
      interaction.guild!.name
    })`
  );

  let emotes: any;
  let response: any;

  if (channel === "global") {
    response = await fetch7tvGlobalEmotes();
    emotes = response;
  } else {
    response = await fetch7tvChannelEmotes(channel as string);
    emotes = response?.emote_set?.emotes;
  }

  if (!response || !emotes?.length) {
    await interaction.editReply(`❌ No emotes found for **${channel}** on 7TV`);
    return;
  }

  const { finalEmotes, detectedExisting } = await processEmotes(
    emotes,
    interaction.guild!,
    (element: SevenTVChannelEmotes) => ({
      name: element.name.replace(/\W/gm, ""),
      url: element.data.animated
        ? `https:${element.data.host.url}/1x.gif`
        : `https:${element.data.host.url}/2x.png`,
    })
  );

  if (finalEmotes.size === 0) {
    await interaction.editReply(
      `ℹ️ All **${channel}** emotes already exist on this server!`
    );
    return;
  }

  stats.successes++;
  queueManager.addToQueue(interaction.guild!.id, {
    emotes: finalEmotes,
    successes: 0,
    failures: 0,
    removed: detectedExisting,
    interaction: interaction,
    priority: 1,
    createdAt: new Date(),
  });

  await interaction.editReply(
    `🚀 **Queued ${finalEmotes.size}/${emotes.length} emotes from ${channel}!**\n` +
      `• ${detectedExisting} already exist\n` +
      `• Estimated time: ${Math.ceil(
        finalEmotes.size / MAX_CONCURRENT_UPLOADS
      )} minutes\n` +
      `• Use \`/cancel-sync\` to cancel\n` +
      `• Use \`/qremove <emote>\` to remove specific emotes`
  );
}

export async function sync_ffz_emotes(
  interaction: CommandInteraction
): Promise<void> {
  const channel = interaction.options.getString("channel");

  if (!channel || queueManager.hasGuild(interaction.guild!.id)) {
    if (queueManager.hasGuild(interaction.guild!.id)) {
      const currentQueue = queueManager.getQueueData(interaction.guild!.id)!;
      await interaction.editReply(
        `⚠️ You already have ${currentQueue.emotes.size} emotes queued!`
      );
    }
    return;
  }

  await interaction.editReply(
    `🔍 Checking FrankerFaceZ for **${channel}** emotes...`
  );

  stats.ffzAttempts++;
  const ffzEmotes: FFZRoom = await cachedFetch(
    `https://api.frankerfacez.com/v1/room/${channel}`,
    `ffz_${channel}`
  );

  if (
    !ffzEmotes?.room?.set ||
    !ffzEmotes.sets?.[ffzEmotes.room.set]?.emoticons
  ) {
    await interaction.editReply(
      `❌ No emotes found for **${channel}** on FrankerFaceZ`
    );
    return;
  }

  const emotes = ffzEmotes.sets[ffzEmotes.room.set].emoticons;
  const { finalEmotes, detectedExisting } = await processEmotes(
    emotes,
    interaction.guild!,
    (element: any) => ({
      name: element.name.replace(/\W/gm, ""),
      url: getBestFFZUrl(element.urls),
    })
  );

  if (finalEmotes.size === 0) {
    await interaction.editReply(
      `ℹ️ All **${channel}** emotes already exist on this server!`
    );
    return;
  }

  stats.ffzSuccesses++;
  queueManager.addToQueue(interaction.guild!.id, {
    emotes: finalEmotes,
    successes: 0,
    failures: 0,
    removed: detectedExisting,
    interaction: interaction,
    priority: 1,
    createdAt: new Date(),
  });

  await interaction.editReply(
    `🚀 **Queued ${finalEmotes.size}/${emotes.length} emotes from ${channel}!**\n` +
      `• ${detectedExisting} already exist\n` +
      `• Estimated time: ${Math.ceil(
        finalEmotes.size / MAX_CONCURRENT_UPLOADS
      )} minutes\n` +
      `• Use \`/cancel-sync\` to cancel`
  );
}

// Helper functions
function getBestFFZUrl(urls: Record<string, string>): string {
  return (
    urls["4"]?.replace("https:/", "https://") ||
    urls["3"]?.replace("https:/", "https://") ||
    urls["2"]?.replace("https:/", "https://") ||
    urls["1"]?.replace("https:/", "https://") ||
    ""
  );
}

async function processEmotes<T>(
  emotes: T[],
  guild: any,
  mapper: (emote: T) => { name: string; url: string }
): Promise<{
  finalEmotes: Collection<string, string>;
  detectedExisting: number;
}> {
  const existingEmojis = new Set(guild.emojis.cache.map((e: any) => e.name));
  const finalEmotes: Collection<string, string> = new Collection();
  let detectedExisting = 0;

  for (const emote of emotes) {
    const { name, url } = mapper(emote);

    if (!name || !url || url.includes("undefined")) continue;

    if (existingEmojis.has(name)) {
      detectedExisting++;
    } else {
      finalEmotes.set(name, url);
    }
  }

  return { finalEmotes, detectedExisting };
}

// Updated utility functions
export async function RemoveEmote(
  interaction: CommandInteraction
): Promise<void> {
  const emote = interaction.options.getString("emote");
  if (!emote) {
    await interaction.editReply("❌ Please specify an emote name!");
    return;
  }

  const queueData = queueManager.getQueueData(interaction.guild!.id);
  if (!queueData) {
    await interaction.editReply("❌ No active queue found!");
    return;
  }

  if (queueData.emotes.has(emote)) {
    queueData.emotes.delete(emote);
    await interaction.editReply(`✅ Removed **${emote}** from queue!`);
  } else {
    await interaction.editReply(
      `❌ **${emote}** not found in queue (case sensitive)!`
    );
  }
}

export async function cancel_sync(
  interaction: CommandInteraction
): Promise<boolean> {
  if (queueManager.removeFromQueue(interaction.guild!.id)) {
    logger.debug(
      `Sync cancelled by ${interaction.user.username} in ${
        interaction.guild!.name
      }`
    );
    await interaction.editReply("✅ Sync cancelled!");
    return true;
  } else {
    await interaction.editReply("❌ No active sync to cancel!");
    return false;
  }
}

// Admin functions
export async function ResetEmoteTimer(
  interaction: CommandInteraction
): Promise<void> {
  await queueManager.resetTimer(interaction);
}

export async function StartEmoteTimer(
  interaction: CommandInteraction
): Promise<void> {
  await queueManager.startTimerAdmin(interaction);
}

// Export stats for monitoring
export function getQueueStats() {
  return queueManager.getStats();
}
