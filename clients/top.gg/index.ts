import { CommandInteraction, EmbedBuilder } from "discord.js";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en.json";
import { URLSearchParams } from "node:url";
import { getLogger } from "../../clients/logger";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { loadCache } from "../cache";
import { databaseClient } from "../database";
import { queueMessage, sendUrgentMessage } from "../message_queue";

// Initialize TimeAgo
TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo("en-US");

// Logger
const logger = getLogger("Top.GG Client");

// Cache instances
export const dblCache = loadCache("dblCache");
const API_CACHE = loadCache("API_CACHE");

// Constants
const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const WEEKEND_CACHE_TTL = 60 * 1000; // 1 minute for weekend check
const VOTE_CACHE_GRACE_PERIOD = 1000; // 1 second grace period for cache checks
const API_TIMEOUT = 10000; // 10 seconds API timeout

// Voting rewards configuration
const VOTING_REWARDS = {
  normal: {
    currency: 2500,
    rareCandies: 1,
  },
  weekend: {
    currency: 5000,
    rareCandies: 2,
  },
} as const;

// Types for better type safety
interface VoteData {
  voted: boolean;
  checked_at: number;
}

interface WeekendData {
  weekend: boolean;
  time: number;
}

interface TopGGResponse {
  voted?: number | boolean;
  is_weekend?: boolean;
}

interface VoteResult {
  success: boolean;
  alreadyVoted: boolean;
  isWeekend: boolean;
  nextVoteTime?: number;
  error?: string;
}

/**
 * Enhanced cache implementation with TTL support
 */
class EnhancedCache<T = any> {
  private data = new Map<string, T>();
  private timers = new Map<string, NodeJS.Timeout>();

  set(key: string, value: T, ttl: number): void {
    // Clear existing timer if present
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }

    // Set new timer for expiration
    const timer = setTimeout(() => this.delete(key), ttl);
    this.timers.set(key, timer);
    this.data.set(key, value);
  }

  get(key: string): T | undefined {
    return this.data.get(key);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): boolean {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    return this.data.delete(key);
  }

  clear(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.data.clear();
    this.timers.clear();
  }

  size(): number {
    return this.data.size;
  }
}

// Enhanced cache instance
const enhancedCache = new EnhancedCache<any>();

/**
 * Enhanced API request function with better error handling and timeouts
 * @param method - HTTP method
 * @param path - API endpoint path
 * @param body - Request body for GET parameters
 * @returns Promise<TopGGResponse>
 */
async function makeTopGGRequest(
  method: "GET" | "POST" = "GET",
  path: string,
  body?: Record<string, any>
): Promise<TopGGResponse> {
  try {
    if (!process.env.TOPGG_KEY) {
      throw new Error("Top.GG API key is not configured");
    }

    let url = `https://top.gg/api/${path}`;

    // Add query parameters for GET requests
    if (body && method === "GET") {
      const params = new URLSearchParams(body);
      url += `?${params}`;
    }

    // Create request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const headers: Record<string, string> = {
      Authorization: process.env.TOPGG_KEY,
    };

    // Add content-type for POST requests
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(
        `Top.GG API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data as TopGGResponse;
  } catch (error) {
    if (error.name === "AbortError") {
      logger.error("Top.GG API request timed out");
      throw new Error("Top.GG API request timed out");
    }

    logger.error(`Top.GG API request failed for ${path}:`, error);
    throw error;
  }
}

/**
 * Check if a user has voted in the last 12 hours
 * @param userId - Discord user ID
 * @returns Promise<boolean>
 */
async function hasVoted(userId: string): Promise<boolean> {
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid user ID provided");
  }

  try {
    const response = await makeTopGGRequest("GET", "bots/check", { userId });

    // Handle both number (timestamp) and boolean responses
    if (typeof response.voted === "number") {
      return response.voted === 1;
    }

    return Boolean(response.voted);
  } catch (error) {
    logger.error(`Error checking vote status for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Check if weekend multiplier is active
 * @returns Promise<boolean>
 */
async function isWeekend(): Promise<boolean> {
  try {
    const response = await makeTopGGRequest("GET", "weekend");
    return Boolean(response.is_weekend);
  } catch (error) {
    logger.error("Error checking weekend status:", error);
    throw error;
  }
}

/**
 * Check weekend status with caching
 * @returns Promise<boolean>
 */
async function checkWeekendWithCache(): Promise<boolean> {
  const cacheKey = "weekend_status";
  const cached = enhancedCache.get(cacheKey) as WeekendData | undefined;

  // Return cached result if still valid
  if (cached && Date.now() - cached.time < WEEKEND_CACHE_TTL) {
    return cached.weekend;
  }

  try {
    const isWeekendNow = await isWeekend();

    // Cache the result
    enhancedCache.set(
      cacheKey,
      {
        weekend: isWeekendNow,
        time: Date.now(),
      },
      WEEKEND_CACHE_TTL
    );

    return isWeekendNow;
  } catch (error) {
    // Return cached result if API fails and we have stale cache
    if (cached) {
      logger.warn("Using stale weekend cache due to API error:", error);
      return cached.weekend;
    }

    // Default to false if no cache and API fails
    logger.error("Weekend check failed, defaulting to false:", error);
    return false;
  }
}

/**
 * Award voting rewards to user
 * @param userId - Discord user ID
 * @param isWeekend - Whether weekend multiplier is active
 * @returns Promise<void>
 */
async function awardVotingRewards(
  userId: string,
  isWeekend: boolean
): Promise<void> {
  try {
    const rewards = isWeekend ? VOTING_REWARDS.weekend : VOTING_REWARDS.normal;

    // Award currency
    await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: userId })
      .increment("currency", rewards.currency);

    // TODO: Award rare candies when item system is implemented
    // for (let i = 0; i < rewards.rareCandies; i++) {
    //   await createItemDB({
    //     uid: userId,
    //     item_number: 50, // Rare Candy
    //   });
    // }

    logger.info(
      `Awarded voting rewards to user ${userId}: ${rewards.currency} currency, ${rewards.rareCandies} rare candies`
    );
  } catch (error) {
    logger.error(`Error awarding voting rewards to user ${userId}:`, error);
    throw error;
  }
}

/**
 * Create voting reward embed
 * @param isWeekend - Whether weekend multiplier is active
 * @returns EmbedBuilder
 */
function createVotingEmbed(isWeekend: boolean): EmbedBuilder {
  const rewards = isWeekend ? VOTING_REWARDS.weekend : VOTING_REWARDS.normal;

  const embed = new EmbedBuilder()
    .setTitle("🗳️ Thanks for Voting!")
    .setColor(isWeekend ? 0x9966cc : 0x00ff00)
    .setDescription(
      `${isWeekend ? "🎉 **Weekend Bonus Active!**\n" : ""}` +
        `You received:\n` +
        `💰 **${rewards.currency.toLocaleString()} currency**\n` +
        `🍭 **${rewards.rareCandies} Rare Cand${
          rewards.rareCandies > 1 ? "ies" : "y"
        }**`
    )
    .addFields({
      name: "⏰ Next Vote",
      value: "You can vote again in 12 hours!",
      inline: false,
    })
    .setFooter({
      text: "Vote at top.gg to support the bot!",
    })
    .setTimestamp();

  return embed;
}

/**
 * Create vote reminder embed
 * @param nextVoteTime - Timestamp when user can vote next
 * @returns EmbedBuilder
 */
function createVoteReminderEmbed(nextVoteTime: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("⏰ Vote Cooldown Active")
    .setColor(0xffa500)
    .setDescription(
      `You've already received your voting rewards recently!\n\n` +
        `⏰ **Next vote available:** ${timeAgo.format(nextVoteTime)}`
    )
    .setFooter({
      text: "Vote at top.gg every 12 hours for rewards!",
    })
    .setTimestamp();

  return embed;
}

/**
 * Enhanced vote checking with comprehensive error handling
 * @param interaction - Discord command interaction
 * @returns Promise<VoteResult>
 */
export async function checkVote(
  interaction: CommandInteraction
): Promise<VoteResult> {
  try {
    const userId = interaction.user.id;
    const currentTime = Date.now();

    // Get cached vote data
    const cachedVote = (await dblCache.get(userId)) as VoteData | undefined;
    const defaultVoteData: VoteData = {
      voted: false,
      checked_at: currentTime - VOTE_COOLDOWN_MS - 1000, // Ensure it's outside cooldown
    };

    const voteData = cachedVote || defaultVoteData;
    const timeSinceLastCheck = currentTime - voteData.checked_at;

    // Check if user is still in cooldown period
    if (
      voteData.voted &&
      timeSinceLastCheck < VOTE_COOLDOWN_MS - VOTE_CACHE_GRACE_PERIOD
    ) {
      const nextVoteTime = voteData.checked_at + VOTE_COOLDOWN_MS;

      await queueMessage(
        { embeds: [createVoteReminderEmbed(nextVoteTime)] },
        interaction,
        true,
        1
      );

      return {
        success: false,
        alreadyVoted: true,
        isWeekend: false,
        nextVoteTime,
      };
    }

    // Check with Top.GG API if cache is stale or user hasn't voted
    if (!voteData.voted || timeSinceLastCheck > VOTE_COOLDOWN_MS) {
      let hasUserVoted: boolean;

      try {
        hasUserVoted = await hasVoted(userId);
      } catch (error) {
        logger.error(`Failed to check vote status for user ${userId}:`, error);

        await sendUrgentMessage(
          "❌ Unable to check your voting status right now. Please try again later.",
          interaction,
          true
        );

        return {
          success: false,
          alreadyVoted: false,
          isWeekend: false,
          error: "API error",
        };
      }

      // Update cache with new vote status
      const newVoteData: VoteData = {
        voted: hasUserVoted,
        checked_at: currentTime,
      };

      await dblCache.set(userId, newVoteData);

      if (hasUserVoted) {
        // User has voted, award rewards
        try {
          const isWeekendNow = await checkWeekendWithCache();

          await awardVotingRewards(userId, isWeekendNow);

          await queueMessage(
            { embeds: [createVotingEmbed(isWeekendNow)] },
            interaction,
            true,
            3 // High priority for success messages
          );

          return {
            success: true,
            alreadyVoted: false,
            isWeekend: isWeekendNow,
          };
        } catch (error) {
          logger.error(
            `Error processing vote rewards for user ${userId}:`,
            error
          );

          await sendUrgentMessage(
            "✅ Vote confirmed, but there was an error processing rewards. Please contact support.",
            interaction,
            true
          );

          return {
            success: false,
            alreadyVoted: false,
            isWeekend: false,
            error: "Reward processing error",
          };
        }
      } else {
        // User hasn't voted yet
        const embed = new EmbedBuilder()
          .setTitle("🗳️ Vote for SmokeyBot!")
          .setColor(0xff6b6b)
          .setDescription(
            "You haven't voted yet! Click the link below to vote and receive rewards:\n\n" +
              "💰 **2,500 currency** (5,000 on weekends)\n" +
              "🍭 **1 Rare Candy** (2 on weekends)"
          )
          .addFields({
            name: "🔗 Vote Link",
            value:
              "[Vote on top.gg](https://top.gg/bot/458710213122457600/vote)",
            inline: false,
          })
          .setFooter({
            text: "You can vote every 12 hours!",
          })
          .setTimestamp();

        await queueMessage({ embeds: [embed] }, interaction, true, 2);

        return {
          success: false,
          alreadyVoted: false,
          isWeekend: false,
        };
      }
    }

    // This shouldn't happen, but handle edge case
    logger.warn(`Unexpected vote check state for user ${userId}`);
    await sendUrgentMessage(
      "❓ Unable to determine your voting status. Please try again.",
      interaction,
      true
    );

    return {
      success: false,
      alreadyVoted: false,
      isWeekend: false,
      error: "Unknown state",
    };
  } catch (error) {
    logger.error("Unexpected error in checkVote:", error);

    await sendUrgentMessage(
      "❌ An unexpected error occurred while checking your vote. Please try again later.",
      interaction,
      true
    );

    return {
      success: false,
      alreadyVoted: false,
      isWeekend: false,
      error: "Unexpected error",
    };
  }
}

/**
 * Get voting statistics for monitoring
 * @returns Object with cache and API statistics
 */
export function getVotingStats() {
  return {
    cacheSize: enhancedCache.size(),
    dblCacheEntries: "N/A", // Would need to expose size from loadCache
    apiCacheEntries: "N/A", // Would need to expose size from loadCache
    rewardsConfig: VOTING_REWARDS,
  };
}

/**
 * Clear voting caches (for admin use)
 */
export function clearVotingCaches(): void {
  enhancedCache.clear();
  logger.info("Voting caches cleared");
}

/**
 * Backwards compatibility - kept for existing code
 * @deprecated Use checkWeekendWithCache instead
 */
async function checkWeekend(): Promise<boolean> {
  logger.warn("checkWeekend is deprecated, use checkWeekendWithCache instead");
  return checkWeekendWithCache();
}

// Export utility functions for testing
export {
  awardVotingRewards,
  checkWeekendWithCache,
  EnhancedCache,
  hasVoted,
  isWeekend,
  makeTopGGRequest,
  VOTE_COOLDOWN_MS,
  VOTING_REWARDS
};
