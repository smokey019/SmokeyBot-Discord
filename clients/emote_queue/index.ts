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

// Simplified stats tracking
interface EmoteStats {
  // Core metrics
  uploads: { success: number; failed: number; };
  platforms: { ffz: number; sevenTv: number; };
  queue: { processed: number; active: number; longestWait: number; };
  api: { calls: number; cached: number; avgResponseTime: number; };
  errors: { rateLimited: number; tooLarge: number; permissions: number; network: number; };
  system: { startTime: Date; lastReset: Date; };
}

// Initialize simplified stats
const stats: EmoteStats = {
  uploads: { success: 0, failed: 0 },
  platforms: { ffz: 0, sevenTv: 0 },
  queue: { processed: 0, active: 0, longestWait: 0 },
  api: { calls: 0, cached: 0, avgResponseTime: 0 },
  errors: { rateLimited: 0, tooLarge: 0, permissions: 0, network: 0 },
  system: { startTime: new Date(), lastReset: new Date() },
};

// API caching with performance tracking (moved before class)
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simplified queue data structure
interface QueueData {
  emotes: Collection<string, string>;
  results: { success: number; failed: number; skipped: number; };
  interaction: CommandInteraction;
  createdAt: Date;
  startedAt?: Date;
  metadata: { guildName: string; channelName: string; userTag: string; };
}

// Simple performance tracking
class SimpleTimer {
  private static timers = new Map<string, number>();

  static start(id: string): void {
    this.timers.set(id, Date.now());
  }

  static end(id: string): number {
    const start = this.timers.get(id);
    if (!start) return 0;
    this.timers.delete(id);
    return Date.now() - start;
  }
}

// queue manager with detailed tracking
class EmoteQueueManager {
  private queue: Collection<string, QueueData> = new Collection();
  private timer?: Timer;
  private isProcessing = false;
  private rateLimitMap = new Map<string, number>();
  private statsTimer?: Timer;

  constructor() {
    // Auto-reset stats every 24 hours
    this.statsTimer = setInterval(() => this.resetStats(), STATS_RESET_INTERVAL);
  }

  get EmoteQueue() {
    return this.queue;
  }

  addToQueue(guildId: string, data: QueueData) {
    data.createdAt = new Date();
    data.metadata = {
      guildName: data.interaction.guild?.name || 'Unknown',
      channelName: data.metadata?.channelName || 'unknown',
      userTag: data.interaction.user.tag
    };
    this.queue.set(guildId, data);
    stats.queue.active = this.queue.size;
    this.startTimer();
  }

  removeFromQueue(guildId: string): boolean {
    const queueData = this.queue.get(guildId);
    if (queueData) {
      const queueTime = Date.now() - queueData.createdAt.getTime();
      if (queueTime > stats.queue.longestWait) {
        stats.queue.longestWait = queueTime;
      }
      stats.queue.processed++;
    }

    const removed = this.queue.delete(guildId);
    stats.queue.active = this.queue.size;

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

    try {
      const guildsToProcess = Array.from(this.queue.entries())
        .slice(0, MAX_CONCURRENT_UPLOADS)
        .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime());

      const processPromises = guildsToProcess.map(([guildId, data]) =>
        this.processGuildQueue(guildId, data)
      );

      await Promise.allSettled(processPromises);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processGuildQueue(guildId: string, data: QueueData) {
    if (data.emotes.size === 0) {
      await this.completeGuildQueue(guildId, data);
      return;
    }

    if (!data.startedAt) {
      data.startedAt = new Date();
    }

    // Rate limiting check
    const lastApiCall = this.rateLimitMap.get(guildId) || 0;
    const now = Date.now();
    if (now - lastApiCall < RATE_LIMIT_DELAY) {
      return;
    }

    const emote = data.emotes.firstKey()!;
    const url = data.emotes.first()!;

    const success = await this.createEmojiWithRetry(url, emote, data);
    data.emotes.delete(emote);
    this.rateLimitMap.set(guildId, now);

    if (success) {
      data.results.success++;
      stats.uploads.success++;
    } else if (this.queue.has(guildId)) {
      data.results.failed++;
      stats.uploads.failed++;
    }

    if (data.emotes.size === 0) {
      await this.completeGuildQueue(guildId, data);
    }
  }

  private async completeGuildQueue(guildId: string, data: QueueData) {
    try {
      const totalTime = data.startedAt
        ? Math.round((Date.now() - data.startedAt.getTime()) / 1000)
        : 0;

      const message = [
        `✅ **Emote sync complete!**`,
        `📊 **Results:**`,
        `• ✅ Successful: ${data.results.success}`,
        `• ❌ Failures: ${data.results.failed}`,
        `• 🔄 Skipped: ${data.results.skipped}`,
        totalTime > 0 ? `⏱️ Time: ${totalTime}s` : '',
        `📈 Use \`/stats-emotes\` for statistics`
      ].filter(Boolean).join('\n');

      await data.interaction.editReply(message);
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
    } else if (message.includes("permission")) {
      stats.errors.permissions++;
    } else if (message.includes("network") || message.includes("timeout")) {
      stats.errors.network++;
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

    const existingEmojis = new Set(data.interaction.guild.emojis.cache.map((e: any) => e.name));

    if (existingEmojis.has(name)) {
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

  // admin functions
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

  // Removed redundant updateSystemStats - stats are updated in real-time

  private resetStats(): void {
    const systemBackup = { ...stats.system };
    
    Object.assign(stats, {
      uploads: { success: 0, failed: 0 },
      platforms: { ffz: 0, sevenTv: 0 },
      queue: { processed: 0, active: this.queue.size, longestWait: 0 },
      api: { calls: 0, cached: 0, avgResponseTime: 0 },
      errors: { rateLimited: 0, tooLarge: 0, permissions: 0, network: 0 },
      system: { ...systemBackup, lastReset: new Date() },
    });

    logger.info("Daily statistics reset completed");
  }

  getDetailedStats() {
    return { ...stats };
  }
}

// Global queue manager instance
const queueManager = new EmoteQueueManager();

async function cachedFetch<T>(url: string, cacheKey: string): Promise<T | null> {
  const cached = apiCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    stats.api.cached++;
    return cached.data;
  }

  const startTime = Date.now();
  stats.api.calls++;

  try {
    const data = await jsonFetch(url);
    const responseTime = Date.now() - startTime;
    
    // Update average response time
    stats.api.avgResponseTime = 
      (stats.api.avgResponseTime * (stats.api.calls - 1) + responseTime) / stats.api.calls;

    apiCache.set(cacheKey, { data, timestamp: now });
    return data;
  } catch (error) {
    logger.error(`API fetch failed for ${url}:`, error);
    return null;
  }
}

// Simplified statistics display
export async function createStatsEmbed(
  interaction: CommandInteraction,
  specificStat?: string
): Promise<void> {
  const stats = queueManager.getDetailedStats();
  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTimestamp()
    .setFooter({ text: 'EmoteBot Statistics' });

  const totalUploads = stats.uploads.success + stats.uploads.failed;
  const successRate = totalUploads > 0 ? ((stats.uploads.success / totalUploads) * 100).toFixed(1) : '0';
  const uptime = Math.floor((Date.now() - stats.system.startTime.getTime()) / (1000 * 60 * 60));

  if (specificStat) {
    switch (specificStat.toLowerCase()) {
      case 'upload':
      case 'uploads':
        embed.setTitle('📤 Upload Statistics')
          .addFields(
            { name: '✅ Successful', value: stats.uploads.success.toLocaleString(), inline: true },
            { name: '❌ Failed', value: stats.uploads.failed.toLocaleString(), inline: true },
            { name: '🎯 Success Rate', value: `${successRate}%`, inline: true },
            { name: '🏷️ 7TV', value: stats.platforms.sevenTv.toLocaleString(), inline: true },
            { name: '🐸 FFZ', value: stats.platforms.ffz.toLocaleString(), inline: true }
          );
        break;

      case 'api':
        embed.setTitle('🔌 API Statistics')
          .addFields(
            { name: '📡 Total Calls', value: stats.api.calls.toLocaleString(), inline: true },
            { name: '💾 Cached', value: stats.api.cached.toLocaleString(), inline: true },
            { name: '⏱️ Avg Response', value: `${stats.api.avgResponseTime.toFixed(0)}ms`, inline: true }
          );
        break;

      case 'errors':
        embed.setTitle('🚫 Error Statistics')
          .addFields(
            { name: '⏳ Rate Limited', value: stats.errors.rateLimited.toLocaleString(), inline: true },
            { name: '📏 Too Large', value: stats.errors.tooLarge.toLocaleString(), inline: true },
            { name: '🔒 Permissions', value: stats.errors.permissions.toLocaleString(), inline: true },
            { name: '🌐 Network', value: stats.errors.network.toLocaleString(), inline: true }
          );
        break;

      case 'queue':
        embed.setTitle('⏳ Queue Statistics')
          .addFields(
            { name: '🔄 Active', value: stats.queue.active.toLocaleString(), inline: true },
            { name: '🏁 Processed', value: stats.queue.processed.toLocaleString(), inline: true },
            { name: '⏰ Longest Wait', value: `${Math.round(stats.queue.longestWait / 1000)}s`, inline: true }
          );
        break;

      default:
        embed.setTitle('❓ Unknown Statistic')
          .setDescription('Available: `upload`, `api`, `errors`, `queue`');
    }
  } else {
    embed.setTitle('📊 EmoteBot Statistics')
      .setDescription(`**Uptime:** ${uptime} hours | **Success Rate:** ${successRate}%`)
      .addFields(
        { name: '📤 Uploads', value: `✅ ${stats.uploads.success}\n❌ ${stats.uploads.failed}`, inline: true },
        { name: '🔌 API', value: `📡 ${stats.api.calls}\n💾 ${stats.api.cached} cached`, inline: true },
        { name: '⏳ Queue', value: `🔄 ${stats.queue.active} active\n🏁 ${stats.queue.processed} done`, inline: true },
        { name: '🏷️ Platforms', value: `7TV: ${stats.platforms.sevenTv}\nFFZ: ${stats.platforms.ffz}`, inline: true },
        { name: '🚫 Errors', value: `Rate: ${stats.errors.rateLimited}\nSize: ${stats.errors.tooLarge}`, inline: true }
      );
  }

  await interaction.editReply({ embeds: [embed] });
}

// Export legacy interface for backwards compatibility
export const EmoteQueue = queueManager.EmoteQueue;
export const queue_attempts = () => stats.uploads.success + stats.uploads.failed;
export const queue_add_success = () => stats.uploads.success;
export const FFZ_emoji_queue_count = () => stats.platforms.ffz;
export const FFZ_emoji_queue_attempt_count = () => stats.platforms.ffz;

// API functions
export async function fetch7tvGlobalEmotes(): Promise<SevenTVEmotes[]> {
  const data = await cachedFetch<SevenTVEmotes[]>(
    "https://7tv.io/v3/emote-sets/global",
    "7tv_global"
  );
  if (data) stats.platforms.sevenTv++;
  return data || [];
}

export async function fetch7tvChannelEmotes(channel: string): Promise<SevenTVChannel[]> {
  const data = await cachedFetch<SevenTVChannel[]>(
    `https://7tv.io/v3/users/twitch/${channel}`,
    `7tv_${channel}`
  );
  if (data) stats.platforms.sevenTv++;
  return data || [];
}

// sync functions with better tracking
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
    results: { success: 0, failed: 0, skipped: detectedExisting },
    interaction: interaction,
    createdAt: new Date(),
    metadata: { guildName: interaction.guild!.name, channelName: channel!, userTag: interaction.user.tag },
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

  const ffzEmotes: FFZRoom = await cachedFetch(
    `https://api.frankerfacez.com/v1/room/${channel}`,
    `ffz_${channel}`
  );

  if (!ffzEmotes?.room?.set || !ffzEmotes.sets?.[ffzEmotes.room.set]?.emoticons) {
    await interaction.editReply(`❌ No emotes found for **${channel}** on FrankerFaceZ`);
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

  stats.platforms.ffz++;
  queueManager.addToQueue(interaction.guild!.id, {
    emotes: finalEmotes,
    results: { success: 0, failed: 0, skipped: detectedExisting },
    interaction: interaction,
    createdAt: new Date(),
    metadata: { guildName: interaction.guild!.name, channelName: channel, userTag: interaction.user.tag },
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

// Helper functions (unchanged but with logging)
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
): Promise<{ finalEmotes: Collection<string, string>; detectedExisting: number; }> {
  const existingEmojis = new Set(guild.emojis.cache.map((e: any) => e.name));
  const finalEmotes: Collection<string, string> = new Collection();
  let detectedExisting = 0;

  for (const emote of emotes) {
    const { name, url, isAnimated } = mapper(emote);

    if (!name || !url || url.includes("undefined")) continue;

    // Apply type filter if specified
    if (typeFilter && isAnimated !== undefined) {
      if ((typeFilter === "gif" && !isAnimated) || (typeFilter === "static" && isAnimated)) {
        continue;
      }
    }

    if (existingEmojis.has(name)) {
      detectedExisting++;
    } else {
      finalEmotes.set(name, url);
    }
  }

  return { finalEmotes, detectedExisting };
}

// utility functions
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

// admin functions
export async function ResetEmoteTimer(interaction: CommandInteraction): Promise<void> {
  await queueManager.resetTimer(interaction);
}

export async function StartEmoteTimer(interaction: CommandInteraction): Promise<void> {
  await queueManager.startTimerAdmin(interaction);
}

// Export stats functions
export function getQueueStats() {
  return queueManager.getDetailedStats();
}

export async function displayQueueStats(interaction: CommandInteraction): Promise<void> {
  const specificStat = interaction.options.getString('statistic');
  await createStatsEmbed(interaction, specificStat || undefined);
}

// Export queue manager for advanced operations
export { queueManager };

