import { Collection, CommandInteraction, EmbedBuilder } from "discord.js";
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
const QUEUE_PROCESSING_INTERVAL = 2500; // Optimized to 2.5 seconds
const MAX_CONCURRENT_UPLOADS = 4; // Increased for better throughput
const RATE_LIMIT_DELAY = 800; // Reduced delay with better error handling
const MAX_RETRIES = 3;
const STATS_RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

const logger = getLogger("Emote Queue");

// Enhanced stats tracking with detailed metrics
interface DetailedStats {
  // Upload Statistics
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  ffzAttempts: number;
  ffzSuccesses: number;
  ffzFailures: number;
  sevenTvAttempts: number;
  sevenTvSuccesses: number;
  sevenTvFailures: number;

  // Type-specific statistics
  staticEmoteUploads: number;
  animatedEmoteUploads: number;
  typeFilterUsage: {
    staticRequests: number;
    gifRequests: number;
    allRequests: number;
  };

  // Performance Metrics
  averageUploadTime: number;
  totalUploadTime: number;
  uploadsProcessed: number;
  queueProcessingCycles: number;
  averageQueueTime: number;

  // API Statistics
  apiCalls: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
    responseTimeTotal: number;
    averageResponseTime: number;
  };

  // Error Tracking
  errors: {
    rateLimited: number;
    tooLarge: number;
    maxEmotesReached: number;
    missingPermissions: number;
    networkErrors: number;
    unknownErrors: number;
  };

  // Cache Statistics
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    entriesCount: number;
  };

  // Queue Metrics
  queue: {
    totalGuildsProcessed: number;
    averageEmotesPerGuild: number;
    longestQueueTime: number;
    currentActiveQueues: number;
  };

  // System Metrics
  system: {
    startTime: Date;
    uptime: number;
    memoryUsage?: number;
    lastResetTime: Date;
  };
}

// Initialize comprehensive stats
const stats: DetailedStats = {
  totalAttempts: 0,
  totalSuccesses: 0,
  totalFailures: 0,
  ffzAttempts: 0,
  ffzSuccesses: 0,
  ffzFailures: 0,
  sevenTvAttempts: 0,
  sevenTvSuccesses: 0,
  sevenTvFailures: 0,
  staticEmoteUploads: 0,
  animatedEmoteUploads: 0,
  typeFilterUsage: {
    staticRequests: 0,
    gifRequests: 0,
    allRequests: 0,
  },
  averageUploadTime: 0,
  totalUploadTime: 0,
  uploadsProcessed: 0,
  queueProcessingCycles: 0,
  averageQueueTime: 0,
  apiCalls: {
    total: 0,
    successful: 0,
    failed: 0,
    cached: 0,
    responseTimeTotal: 0,
    averageResponseTime: 0,
  },
  errors: {
    rateLimited: 0,
    tooLarge: 0,
    maxEmotesReached: 0,
    missingPermissions: 0,
    networkErrors: 0,
    unknownErrors: 0,
  },
  cache: {
    hits: 0,
    misses: 0,
    hitRate: 0,
    entriesCount: 0,
  },
  queue: {
    totalGuildsProcessed: 0,
    averageEmotesPerGuild: 0,
    longestQueueTime: 0,
    currentActiveQueues: 0,
  },
  system: {
    startTime: new Date(),
    uptime: 0,
    lastResetTime: new Date(),
  },
};

// Enhanced API caching with performance tracking (moved before class)
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Enhanced queue data structure
interface QueueData {
  emotes: Collection<string, string>;
  successes: number;
  failures: number;
  removed: number;
  interaction: CommandInteraction;
  priority: number;
  createdAt: Date;
  startedProcessing?: Date;
  estimatedCompletion?: Date;
  processingTimes: number[];
  guildName: string;
  channelName: string;
  userTag: string;
}

// Performance monitoring utilities
class PerformanceMonitor {
  private static timers = new Map<string, number>();

  static start(label: string): void {
    this.timers.set(label, Date.now());
  }

  static end(label: string): number {
    const startTime = this.timers.get(label);
    if (!startTime) return 0;

    const duration = Date.now() - startTime;
    this.timers.delete(label);
    return duration;
  }

  static record(label: string, duration: number): void {
    if (label === 'upload') {
      stats.totalUploadTime += duration;
      stats.uploadsProcessed++;
      stats.averageUploadTime = stats.totalUploadTime / stats.uploadsProcessed;
    }
  }
}

// Enhanced queue manager with detailed tracking
class EmoteQueueManager {
  private queue: Collection<string, QueueData> = new Collection();
  private timer?: Timer;
  private isProcessing = false;
  private rateLimitMap = new Map<string, number>();
  private statsTimer?: Timer;

  constructor() {
    // Auto-reset stats every 24 hours
    this.statsTimer = setInterval(() => this.resetStats(), STATS_RESET_INTERVAL);
    this.updateSystemStats();
  }

  get EmoteQueue() {
    return this.queue;
  }

  addToQueue(guildId: string, data: QueueData) {
    data.createdAt = new Date();
    data.guildName = data.interaction.guild?.name || 'Unknown';
    data.userTag = data.interaction.user.tag;
    this.queue.set(guildId, data);
    stats.queue.currentActiveQueues = this.queue.size;
    this.startTimer();
  }

  removeFromQueue(guildId: string): boolean {
    const queueData = this.queue.get(guildId);
    if (queueData) {
      const queueTime = Date.now() - queueData.createdAt.getTime();
      if (queueTime > stats.queue.longestQueueTime) {
        stats.queue.longestQueueTime = queueTime;
      }
      stats.queue.totalGuildsProcessed++;

      // Update average emotes per guild
      const totalEmotes = queueData.successes + queueData.failures + queueData.removed;
      const totalGuilds = stats.queue.totalGuildsProcessed;
      stats.queue.averageEmotesPerGuild =
        ((stats.queue.averageEmotesPerGuild * (totalGuilds - 1)) + totalEmotes) / totalGuilds;
    }

    const removed = this.queue.delete(guildId);
    stats.queue.currentActiveQueues = this.queue.size;

    if (this.queue.size === 0) {
      this.stopTimer();
    }
    return removed;
  }

  hasGuild(guildId: string): boolean {
    return this.queue.has(guildId);
  }

  getQueueData(guildId: string): QueueData | undefined {
    return this.queue.get(guildId);
  }

  get size(): number {
    return this.queue.size;
  }

  private startTimer() {
    if (!this.timer) {
      this.timer = setInterval(
        () => this.processQueue(),
        QUEUE_PROCESSING_INTERVAL
      );
    }
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.size === 0) return;

    this.isProcessing = true;
    stats.queueProcessingCycles++;
    PerformanceMonitor.start('queue_cycle');

    try {
      const guildsToProcess = Array.from(this.queue.keys())
        .slice(0, MAX_CONCURRENT_UPLOADS)
        .map((guildId) => ({ guildId, data: this.queue.get(guildId)! }))
        .sort((a, b) => {
          // Priority queue: higher priority first, then oldest first
          if (a.data.priority !== b.data.priority) {
            return b.data.priority - a.data.priority;
          }
          return a.data.createdAt.getTime() - b.data.createdAt.getTime();
        });

      const processPromises = guildsToProcess.map(({ guildId, data }) =>
        this.processGuildQueue(guildId, data)
      );

      await Promise.allSettled(processPromises);
    } finally {
      this.isProcessing = false;
      const cycleDuration = PerformanceMonitor.end('queue_cycle');
      PerformanceMonitor.record('queue_cycle', cycleDuration);
    }
  }

  private async processGuildQueue(guildId: string, data: QueueData) {
    if (data.emotes.size === 0) {
      await this.completeGuildQueue(guildId, data);
      return;
    }

    if (!data.startedProcessing) {
      data.startedProcessing = new Date();
    }

    // Enhanced rate limiting with backoff
    const lastApiCall = this.rateLimitMap.get(guildId) || 0;
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;

    if (timeSinceLastCall < RATE_LIMIT_DELAY) {
      return;
    }

    const emote = data.emotes.firstKey()!;
    const url = data.emotes.first()!;

    PerformanceMonitor.start(`upload_${guildId}_${emote}`);
    const success = await this.createEmojiWithRetry(url, emote, data);
    const uploadTime = PerformanceMonitor.end(`upload_${guildId}_${emote}`);

    data.processingTimes.push(uploadTime);
    PerformanceMonitor.record('upload', uploadTime);

    data.emotes.delete(emote);
    this.rateLimitMap.set(guildId, now);

    if (success) {
      data.successes++;
      stats.totalSuccesses++;
    } else if (this.queue.has(guildId)) {
      data.failures++;
      stats.totalFailures++;
    }

    stats.totalAttempts++;

    // Update estimated completion time
    if (data.processingTimes.length > 0) {
      const avgTime = data.processingTimes.reduce((a, b) => a + b, 0) / data.processingTimes.length;
      const remainingEmotes = data.emotes.size;
      data.estimatedCompletion = new Date(Date.now() + (avgTime * remainingEmotes));
    }

    if (data.emotes.size === 0) {
      await this.completeGuildQueue(guildId, data);
    }
  }

  private async completeGuildQueue(guildId: string, data: QueueData) {
    try {
      const totalTime = data.startedProcessing
        ? Date.now() - data.startedProcessing.getTime()
        : 0;

      const timeStr = totalTime > 0 ? `⏱️ Time: ${Math.round(totalTime / 1000)}s\n` : '';

      await data.interaction.editReply(
        `✅ **Emote sync complete!**\n` +
        `📊 **Results:**\n` +
        `• ✅ Successful: ${data.successes}\n` +
        `• ❌ Failures: ${data.failures}\n` +
        `• 🔄 Skipped (existing): ${data.removed}\n` +
        timeStr +
        `📈 Use \`/stats-emotes\` for detailed statistics`
      );
    } catch (error) {
      logger.error(`Failed to send completion message for guild ${guildId}:`, error);
    }

    this.removeFromQueue(guildId);
  }

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
        logger.debug(`Retrying emoji creation for ${name}, attempt ${attempt + 1}`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        return this.createEmojiWithRetry(emoteUrl, name, data, attempt + 1);
      }

      logger.error(`Failed to create emoji ${name} after ${attempt} attempts:`, error);
      this.recordError(error);
      return false;
    }
  }

  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || "";
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("rate limit") ||
      message.includes("socket")
    );
  }

  private recordError(error: any): void {
    const message = error.message?.toLowerCase() || "";

    if (message.includes("rate limit")) {
      stats.errors.rateLimited++;
    } else if (message.includes("too large") || message.includes("resize")) {
      stats.errors.tooLarge++;
    } else if (message.includes("maximum number")) {
      stats.errors.maxEmotesReached++;
    } else if (message.includes("permission")) {
      stats.errors.missingPermissions++;
    } else if (message.includes("network") || message.includes("timeout")) {
      stats.errors.networkErrors++;
    } else {
      stats.errors.unknownErrors++;
    }
  }

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

      // Update interaction less frequently to reduce API calls
      if (data.successes % 3 === 0 && data.successes > 0) {
        const progressPercent = Math.round(
          ((data.successes + data.failures) / (data.successes + data.failures + data.emotes.size)) * 100
        );

        const eta = data.estimatedCompletion
          ? ` (ETA: ${Math.round((data.estimatedCompletion.getTime() - Date.now()) / 1000)}s)`
          : '';

          logger.debug(`${progressPercent}% (${data.successes}`);

        await data.interaction
          .editReply(`🚀 **Uploading emotes...** ${progressPercent}% (${data.successes} completed)${eta}`)
          .catch(() => { });
      }

      return true;
    } catch (error) {
      return this.handleEmojiCreationError(error, name, data);
    }
  }

  private async handleEmojiCreationError(
    error: any,
    name: string,
    data: QueueData
  ): Promise<boolean> {
    const message = error.message || "";
    this.recordError(error);

    if (message.includes("Failed to resize asset")) {
      logger.debug(`Emote ${name} is too large`);
      await data.interaction
        .editReply(
          `⚠️ **${name}** is too large. Try the 1x version: [View Emote](${data.emotes.get(name)})`
        )
        .catch(() => { });
      return false;
    }

    if (message.includes("Maximum number")) {
      logger.debug(`Maximum emotes reached in ${data.interaction.guild?.name}`);
      await data.interaction
        .editReply(
          `❌ **Server emote limit reached!** Free up some emote slots and try again.`
        )
        .catch(() => { });
      this.removeFromQueue(data.interaction.guild!.id);
      return false;
    }

    if (message.includes("Missing Permissions")) {
      logger.debug(`Missing permissions in ${data.interaction.guild?.name}`);
      await data.interaction
        .editReply(
          `❌ **Missing permissions!** Please give SmokeyBot the "Manage Emojis and Stickers" permission.`
        )
        .catch(() => { });
      this.removeFromQueue(data.interaction.guild!.id);
      return false;
    }

    logger.error(`Emoji creation error for ${name}:`, error);
    return false;
  }

  // Enhanced admin functions
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

  private updateSystemStats(): void {
    stats.system.uptime = Date.now() - stats.system.startTime.getTime();

    // Update cache stats
    stats.cache.entriesCount = apiCache.size;
    if (stats.cache.hits + stats.cache.misses > 0) {
      stats.cache.hitRate = (stats.cache.hits / (stats.cache.hits + stats.cache.misses)) * 100;
    }

    // Update API averages
    if (stats.apiCalls.total > 0) {
      stats.apiCalls.averageResponseTime = stats.apiCalls.responseTimeTotal / stats.apiCalls.total;
    }

    // Schedule next update
    setTimeout(() => this.updateSystemStats(), 30000); // Update every 30 seconds
  }

  private resetStats(): void {
    // Reset daily stats but keep system stats
    const systemBackup = { ...stats.system };

    Object.assign(stats, {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      ffzAttempts: 0,
      ffzSuccesses: 0,
      ffzFailures: 0,
      sevenTvAttempts: 0,
      sevenTvSuccesses: 0,
      sevenTvFailures: 0,
      staticEmoteUploads: 0,
      animatedEmoteUploads: 0,
      typeFilterUsage: {
        staticRequests: 0,
        gifRequests: 0,
        allRequests: 0,
      },
      averageUploadTime: 0,
      totalUploadTime: 0,
      uploadsProcessed: 0,
      queueProcessingCycles: 0,
      averageQueueTime: 0,
      apiCalls: {
        total: 0,
        successful: 0,
        failed: 0,
        cached: 0,
        responseTimeTotal: 0,
        averageResponseTime: 0,
      },
      errors: {
        rateLimited: 0,
        tooLarge: 0,
        maxEmotesReached: 0,
        missingPermissions: 0,
        networkErrors: 0,
        unknownErrors: 0,
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        entriesCount: apiCache.size,
      },
      queue: {
        totalGuildsProcessed: 0,
        averageEmotesPerGuild: 0,
        longestQueueTime: 0,
        currentActiveQueues: this.queue.size,
      },
      system: {
        ...systemBackup,
        lastResetTime: new Date(),
      },
    });

    logger.info("Daily statistics reset completed");
  }

  getDetailedStats() {
    this.updateSystemStats();
    return { ...stats };
  }
}

// Global queue manager instance
const queueManager = new EmoteQueueManager();

async function cachedFetch<T>(url: string, cacheKey: string): Promise<T | null> {
  const cached = apiCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    logger.debug(`Using cached data for ${cacheKey}`);
    stats.cache.hits++;
    stats.apiCalls.cached++;
    return cached.data;
  }

  stats.cache.misses++;
  stats.apiCalls.total++;

  const startTime = Date.now();

  try {
    const data = await jsonFetch(url);
    const responseTime = Date.now() - startTime;

    stats.apiCalls.successful++;
    stats.apiCalls.responseTimeTotal += responseTime;

    apiCache.set(cacheKey, { data, timestamp: now });
    return data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    stats.apiCalls.failed++;
    stats.apiCalls.responseTimeTotal += responseTime;

    logger.error(`API fetch failed for ${url}:`, error);
    return null;
  }
}

// Create Discord embed for statistics display
export async function createStatsEmbed(
  interaction: CommandInteraction,
  specificStat?: string
): Promise<void> {
  const detailedStats = queueManager.getDetailedStats();
  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTimestamp()
    .setFooter({ text: 'EmoteBot Statistics' });

  if (specificStat) {
    // Show specific statistic category
    switch (specificStat.toLowerCase()) {
      case 'upload':
      case 'uploads':
        embed.setTitle('📤 Upload Statistics')
          .addFields(
            { name: '✅ Total Successes', value: detailedStats.totalSuccesses.toLocaleString(), inline: true },
            { name: '❌ Total Failures', value: detailedStats.totalFailures.toLocaleString(), inline: true },
            { name: '🎯 Success Rate', value: `${detailedStats.totalAttempts > 0 ? ((detailedStats.totalSuccesses / detailedStats.totalAttempts) * 100).toFixed(1) : 0}%`, inline: true },
            { name: '⏱️ Avg Upload Time', value: `${detailedStats.averageUploadTime.toFixed(0)}ms`, inline: true },
            { name: '🖼️ Static Uploads', value: detailedStats.staticEmoteUploads.toLocaleString(), inline: true },
            { name: '🎬 Animated Uploads', value: detailedStats.animatedEmoteUploads.toLocaleString(), inline: true },
            { name: '🏷️ 7TV Successes', value: detailedStats.sevenTvSuccesses.toLocaleString(), inline: true },
            { name: '🐸 FFZ Successes', value: detailedStats.ffzSuccesses.toLocaleString(), inline: true },
            {
              name: '🔍 Filter Usage',
              value: `Static: ${detailedStats.typeFilterUsage.staticRequests}\nGIF: ${detailedStats.typeFilterUsage.gifRequests}\nAll: ${detailedStats.typeFilterUsage.allRequests}`,
              inline: true
            }
          );
        break;

      case 'api':
        embed.setTitle('🔌 API Statistics')
          .addFields(
            { name: '📡 Total Calls', value: detailedStats.apiCalls.total.toLocaleString(), inline: true },
            { name: '✅ Successful', value: detailedStats.apiCalls.successful.toLocaleString(), inline: true },
            { name: '❌ Failed', value: detailedStats.apiCalls.failed.toLocaleString(), inline: true },
            { name: '💾 Cached', value: detailedStats.apiCalls.cached.toLocaleString(), inline: true },
            { name: '⏱️ Avg Response', value: `${detailedStats.apiCalls.averageResponseTime.toFixed(0)}ms`, inline: true },
            { name: '📊 Cache Hit Rate', value: `${detailedStats.cache.hitRate.toFixed(1)}%`, inline: true }
          );
        break;

      case 'errors':
        embed.setTitle('🚫 Error Statistics')
          .addFields(
            { name: '⏳ Rate Limited', value: detailedStats.errors.rateLimited.toLocaleString(), inline: true },
            { name: '📏 Too Large', value: detailedStats.errors.tooLarge.toLocaleString(), inline: true },
            { name: '🔒 No Permission', value: detailedStats.errors.missingPermissions.toLocaleString(), inline: true },
            { name: '🌐 Network Errors', value: detailedStats.errors.networkErrors.toLocaleString(), inline: true },
            { name: '📊 Max Emotes', value: detailedStats.errors.maxEmotesReached.toLocaleString(), inline: true },
            { name: '❓ Unknown', value: detailedStats.errors.unknownErrors.toLocaleString(), inline: true }
          );
        break;

      case 'queue':
        const activeQueues = Array.from(queueManager.EmoteQueue.values());
        embed.setTitle('⏳ Queue Statistics')
          .addFields(
            { name: '🔄 Active Queues', value: detailedStats.queue.currentActiveQueues.toLocaleString(), inline: true },
            { name: '🏁 Total Processed', value: detailedStats.queue.totalGuildsProcessed.toLocaleString(), inline: true },
            { name: '📊 Avg Emotes/Guild', value: detailedStats.queue.averageEmotesPerGuild.toFixed(1), inline: true },
            { name: '⏰ Longest Queue', value: `${Math.round(detailedStats.queue.longestQueueTime / 1000)}s`, inline: true },
            { name: '🔄 Processing Cycles', value: detailedStats.queueProcessingCycles.toLocaleString(), inline: true },
            {
              name: '📈 Queue Details', value: activeQueues.length > 0 ?
                activeQueues.map(q => `${q.guildName}: ${q.emotes.size} pending`).slice(0, 3).join('\n') +
                (activeQueues.length > 3 ? `\n...and ${activeQueues.length - 3} more` : '') :
                'No active queues', inline: false
            }
          );
        break;

      case 'system':
        const uptimeHours = Math.floor(detailedStats.system.uptime / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((detailedStats.system.uptime % (1000 * 60 * 60)) / (1000 * 60));

        embed.setTitle('⚙️ System Statistics')
          .addFields(
            { name: '🟢 Uptime', value: `${uptimeHours}h ${uptimeMinutes}m`, inline: true },
            { name: '🔄 Start Time', value: `<t:${Math.floor(detailedStats.system.startTime.getTime() / 1000)}:R>`, inline: true },
            { name: '🔄 Last Reset', value: `<t:${Math.floor(detailedStats.system.lastResetTime.getTime() / 1000)}:R>`, inline: true },
            { name: '💾 Cache Entries', value: detailedStats.cache.entriesCount.toLocaleString(), inline: true },
            { name: '📊 Cache Hit Rate', value: `${detailedStats.cache.hitRate.toFixed(1)}%`, inline: true },
            { name: '🔥 Processing', value: queueManager['isProcessing'] ? '✅ Active' : '❌ Idle', inline: true }
          );
        break;

      default:
        embed.setTitle('❓ Unknown Statistic')
          .setDescription('Available categories: `upload`, `api`, `errors`, `queue`, `system`');
    }
  } else {
    // Show overview of all statistics (condensed for 2000 char limit)
    const successRate = detailedStats.totalAttempts > 0 ?
      ((detailedStats.totalSuccesses / detailedStats.totalAttempts) * 100).toFixed(1) : '0';

    const uptimeHours = Math.floor(detailedStats.system.uptime / (1000 * 60 * 60));

    embed.setTitle('📊 EmoteBot Statistics Overview')
      .setDescription(`**System Uptime:** ${uptimeHours} hours\n**Success Rate:** ${successRate}%`)
      .addFields(
        {
          name: '📤 Uploads',
          value: `✅ ${detailedStats.totalSuccesses.toLocaleString()}\n❌ ${detailedStats.totalFailures.toLocaleString()}\n⏱️ ${detailedStats.averageUploadTime.toFixed(0)}ms avg`,
          inline: true
        },
        {
          name: '🔌 API',
          value: `📡 ${detailedStats.apiCalls.total.toLocaleString()} calls\n💾 ${detailedStats.cache.hitRate.toFixed(1)}% cache hit\n⏱️ ${detailedStats.apiCalls.averageResponseTime.toFixed(0)}ms avg`,
          inline: true
        },
        {
          name: '⏳ Queue',
          value: `🔄 ${detailedStats.queue.currentActiveQueues} active\n🏁 ${detailedStats.queue.totalGuildsProcessed} completed\n📊 ${detailedStats.queue.averageEmotesPerGuild.toFixed(1)} avg/guild`,
          inline: true
        },
        {
          name: '🏷️ Platform Stats',
          value: `7TV: ${detailedStats.sevenTvSuccesses}✅ ${detailedStats.sevenTvFailures}❌\nFFZ: ${detailedStats.ffzSuccesses}✅ ${detailedStats.ffzFailures}❌`,
          inline: true
        },
        {
          name: '🚫 Top Errors',
          value: `Rate Limited: ${detailedStats.errors.rateLimited}\nToo Large: ${detailedStats.errors.tooLarge}\nNetwork: ${detailedStats.errors.networkErrors}`,
          inline: true
        },
        {
          name: '💡 Commands',
          value: '`/stats-emotes upload` - Upload details\n`/stats-emotes api` - API metrics\n`/stats-emotes errors` - Error breakdown',
          inline: true
        }
      );
  }

  await interaction.editReply({ embeds: [embed] });
}

// Export legacy interface for backwards compatibility
export const EmoteQueue = queueManager.EmoteQueue;
export const queue_attempts = () => stats.totalAttempts;
export const queue_add_success = () => stats.totalSuccesses;
export const FFZ_emoji_queue_count = () => stats.ffzSuccesses;
export const FFZ_emoji_queue_attempt_count = () => stats.ffzAttempts;

// Enhanced API functions
export async function fetch7tvGlobalEmotes(): Promise<SevenTVEmotes[]> {
  stats.sevenTvAttempts++;
  const data = await cachedFetch<SevenTVEmotes[]>(
    "https://7tv.io/v3/emote-sets/global",
    "7tv_global"
  );
  if (data) stats.sevenTvSuccesses++;
  else stats.sevenTvFailures++;
  return data || [];
}

export async function fetch7tvChannelEmotes(channel: string): Promise<SevenTVChannel[]> {
  stats.sevenTvAttempts++;
  const data = await cachedFetch<SevenTVChannel[]>(
    `https://7tv.io/v3/users/twitch/${channel}`,
    `7tv_${channel}`
  );
  if (data) stats.sevenTvSuccesses++;
  else stats.sevenTvFailures++;
  return data || [];
}

// Enhanced sync functions with better tracking
export async function sync_7tv_emotes(interaction: CommandInteraction): Promise<void> {
  const channel = interaction.options.getString("channel").toLowerCase();
  const channelID = await getIDwithUser(channel);
  const filterType = interaction.options.getString("type").toLowerCase();

  if (!channelID || queueManager.hasGuild(interaction.guild!.id)) {
    if (queueManager.hasGuild(interaction.guild!.id)) {
      const currentQueue = queueManager.getQueueData(interaction.guild!.id)!;
      await interaction.editReply(
        `⚠️ You already have ${currentQueue.emotes.size} emotes queued!`
      );
    }
    return;
  }

  await interaction.editReply(`🔍 Checking 7TV for **${channel}** emotes...`);

  logger.debug(`Fetching 7TV emotes for ${channel} (${interaction.user.username} in ${interaction.guild!.name})`);

  let emotes: any;
  let response: any;

  if (channel === "global") {
    response = await fetch7tvGlobalEmotes();
    emotes = response;
  } else {
    response = await fetch7tvChannelEmotes(channelID as string);
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
      isAnimated: element.data.animated
    }),
    filterType
  );

  if (finalEmotes.size === 0) {
    await interaction.editReply(`ℹ️ All **${channel}** emotes already exist on this server!`);
    return;
  }

  queueManager.addToQueue(interaction.guild!.id, {
    emotes: finalEmotes,
    successes: 0,
    failures: 0,
    removed: detectedExisting,
    interaction: interaction,
    priority: 1,
    createdAt: new Date(),
    processingTimes: [],
    guildName: interaction.guild!.name,
    channelName: channel!,
    userTag: interaction.user.tag,
  });

  const estimatedMinutes = Math.ceil(finalEmotes.size / MAX_CONCURRENT_UPLOADS / 2);

  await interaction.editReply(
    `🚀 **Queued ${finalEmotes.size}/${emotes.length} emotes from ${channel}!**\n` +
    `• ${detectedExisting} already exist\n` +
    `• Estimated time: ${estimatedMinutes} minute(s)\n` +
    `• Position in queue: ${queueManager.size}\n` +
    `• Use \`/cancel-sync\` to cancel\n` +
    `• Use \`/stats-emotes\` for detailed statistics`
  );
}

export async function sync_ffz_emotes(interaction: CommandInteraction): Promise<void> {
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

  await interaction.editReply(`🔍 Checking FrankerFaceZ for **${channel}** emotes...`);

  stats.ffzAttempts++;
  const ffzEmotes: FFZRoom = await cachedFetch(
    `https://api.frankerfacez.com/v1/room/${channel}`,
    `ffz_${channel}`
  );

  if (!ffzEmotes?.room?.set || !ffzEmotes.sets?.[ffzEmotes.room.set]?.emoticons) {
    await interaction.editReply(`❌ No emotes found for **${channel}** on FrankerFaceZ`);
    stats.ffzFailures++;
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
    await interaction.editReply(`ℹ️ All **${channel}** emotes already exist on this server!`);
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
    processingTimes: [],
    guildName: interaction.guild!.name,
    channelName: channel,
    userTag: interaction.user.tag,
  });

  const estimatedMinutes = Math.ceil(finalEmotes.size / MAX_CONCURRENT_UPLOADS / 2);

  await interaction.editReply(
    `🚀 **Queued ${finalEmotes.size}/${emotes.length} emotes from ${channel}!**\n` +
    `• ${detectedExisting} already exist\n` +
    `• Estimated time: ${estimatedMinutes} minute(s)\n` +
    `• Position in queue: ${queueManager.size}\n` +
    `• Use \`/cancel-sync\` to cancel\n` +
    `• Use \`/stats-emotes\` for detailed statistics`
  );
}

// Helper functions (unchanged but with enhanced logging)
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
  mapper: (emote: T) => { name: string; url: string; isAnimated?: boolean },
  typeFilter?: string
): Promise<{
  finalEmotes: Collection<string, string>;
  detectedExisting: number;
  skippedByType: number;
}> {
  const existingEmojis = new Set(guild.emojis.cache.map((e: any) => e.name));
  const finalEmotes: Collection<string, string> = new Collection();
  let detectedExisting = 0;
  let skippedByType = 0;

  for (const emote of emotes) {
    const { name, url, isAnimated } = mapper(emote);

    if (!name || !url || url.includes("undefined")) continue;

    // Apply type filter if specified
    if (typeFilter && isAnimated !== undefined) {
      if (typeFilter === "gif" && !isAnimated) {
        skippedByType++;
        continue;
      }
      if (typeFilter === "static" && isAnimated) {
        skippedByType++;
        continue;
      }
    }

    if (existingEmojis.has(name)) {
      detectedExisting++;
    } else {
      finalEmotes.set(name, url);
    }
  }

  return { finalEmotes, detectedExisting, skippedByType };
}

// Enhanced utility functions
export async function RemoveEmote(interaction: CommandInteraction): Promise<void> {
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
    await interaction.editReply(`✅ Removed **${emote}** from queue! (${queueData.emotes.size} remaining)`);
  } else {
    await interaction.editReply(`❌ **${emote}** not found in queue (case sensitive)!`);
  }
}

export async function cancel_sync(interaction: CommandInteraction): Promise<boolean> {
  if (queueManager.removeFromQueue(interaction.guild!.id)) {
    logger.debug(`Sync cancelled by ${interaction.user.username} in ${interaction.guild!.name}`);
    await interaction.editReply("✅ Sync cancelled!");
    return true;
  } else {
    await interaction.editReply("❌ No active sync to cancel!");
    return false;
  }
}

// Enhanced admin functions
export async function ResetEmoteTimer(interaction: CommandInteraction): Promise<void> {
  await queueManager.resetTimer(interaction);
}

export async function StartEmoteTimer(interaction: CommandInteraction): Promise<void> {
  await queueManager.startTimerAdmin(interaction);
}

// Export enhanced stats functions
export function getQueueStats() {
  return queueManager.getDetailedStats();
}

export async function displayQueueStats(interaction: CommandInteraction): Promise<void> {
  const specificStat = interaction.options.getString('statistic');
  await createStatsEmbed(interaction, specificStat || undefined);
}

// Export queue manager for advanced operations
export { queueManager };

