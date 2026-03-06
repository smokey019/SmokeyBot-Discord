import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
	getMessageQueueStats,
	getQueueHealth,
	formatDuration,
	type QueueStatistics
} from "./index";

/**
 * Creates a Discord embed displaying message queue statistics
 * @param interaction The Discord command interaction
 * @returns Promise<EmbedBuilder> The formatted statistics embed
 */
export async function createQueueStatsEmbed(interaction: ChatInputCommandInteraction): Promise<EmbedBuilder> {
  const statisticType = interaction.options.getString('statistic')?.toLowerCase();
  const stats = getMessageQueueStats();
  const health = getQueueHealth();

  // Choose embed based on requested statistic type
  switch (statisticType) {
    case 'performance':
    case 'perf':
      return createPerformanceEmbed(stats);

    case 'errors':
    case 'error':
      return createErrorEmbed(stats, health);

    case 'queue':
    case 'q':
      return createQueueDetailsEmbed(stats);

    case 'types':
    case 'type':
      return createMessageTypesEmbed(stats);

    case 'health':
      return createHealthEmbed(stats, health);

    case 'full':
    case 'detailed':
      return createDetailedEmbed(stats);

    default:
      return createOverviewEmbed(stats, health);
  }
}

/**
 * Main overview embed - most important stats that fit under 2000 characters
 */
function createOverviewEmbed(stats: QueueStatistics, health: ReturnType<typeof getQueueHealth>): EmbedBuilder {
  const uptime = formatDuration(stats.uptime);
  const healthIcon = stats.isHealthy ? "🟢" : "🔴";
  const queueIcon = stats.currentQueueSize > 0 ? "📬" : "📭";

  const embed = new EmbedBuilder()
    .setTitle("📊 Message Queue Statistics")
    .setColor(stats.isHealthy ? 0x00ff00 : stats.successRate > 90 ? 0xffff00 : 0xff0000)
    .setTimestamp();

  // Health & Performance (most important)
  embed.addFields({
    name: `${healthIcon} System Health`,
    value: [
      `**Status:** ${health.status.toUpperCase()}`,
      `**Success Rate:** ${stats.successRate.toFixed(1)}%`,
      `**Uptime:** ${uptime}`,
      `**Queue Size:** ${queueIcon} ${stats.currentQueueSize}`,
    ].join('\n'),
    inline: true
  });

  // Throughput & Processing
  embed.addFields({
    name: "⚡ Performance",
    value: [
      `**Throughput:** ${stats.throughputPerMinute.toFixed(1)}/min`,
      `**Avg Processing:** ${stats.avgProcessingTime.toFixed(1)}ms`,
      `**Avg Wait Time:** ${stats.avgWaitTime.toFixed(1)}ms`,
      `**Peak Queue:** ${stats.peakQueueSize}`,
    ].join('\n'),
    inline: true
  });

  // Activity Summary
  embed.addFields({
    name: "📈 Activity Summary",
    value: [
      `**Total Processed:** ${stats.processed.toLocaleString()}`,
      `**Failed:** ${stats.failed.toLocaleString()}`,
      `**Retries:** ${stats.retries.toLocaleString()}`,
      `**Rate Limits:** ${stats.rateLimitHits.toLocaleString()}`,
    ].join('\n'),
    inline: true
  });

  // Top Message Types (if any)
  const topTypes = Object.entries(stats.messagesByType)
    .sort(([,a], [,b]) => b.processed - a.processed)
    .slice(0, 3);

  if (topTypes.length > 0) {
    embed.addFields({
      name: "📝 Top Message Types",
      value: topTypes.map(([type, data]) =>
        `**${type}:** ${data.processed.toLocaleString()} (${data.failed} failed)`
      ).join('\n'),
      inline: false
    });
  }

  // Recent Errors (if any)
  if (health.recentErrors.length > 0) {
    const errorText = health.recentErrors
      .slice(0, 3)
      .map(([type, count]) => `**${type}:** ${count}`)
      .join(', ');

    embed.addFields({
      name: "⚠️ Recent Errors",
      value: errorText,
      inline: false
    });
  }

  // Footer with available commands
  embed.setFooter({
    text: "Use statistic: performance|errors|queue|types|health|detailed for more info"
  });

  return embed;
}

/**
 * Performance-focused embed
 */
function createPerformanceEmbed(stats: QueueStatistics): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("⚡ Queue Performance Metrics")
    .setColor(0x0099ff)
    .setTimestamp();

  embed.addFields({
    name: "🚀 Throughput",
    value: [
      `**Per Second:** ${stats.throughputPerSecond.toFixed(2)}`,
      `**Per Minute:** ${stats.throughputPerMinute.toFixed(1)}`,
      `**Total Processed:** ${stats.processed.toLocaleString()}`,
      `**Processing:** ${stats.processing ? "Active" : "Idle"}`,
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: "⏱️ Processing Times",
    value: [
      `**Average:** ${stats.avgProcessingTime.toFixed(2)}ms`,
      `**Minimum:** ${isFinite(stats.minProcessingTime) ? stats.minProcessingTime.toFixed(2) : 0}ms`,
      `**Maximum:** ${stats.maxProcessingTime.toFixed(2)}ms`,
      `**Total Time:** ${formatDuration(stats.totalProcessingTime)}`,
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: "⏳ Wait Times",
    value: [
      `**Average:** ${stats.avgWaitTime.toFixed(2)}ms`,
      `**Minimum:** ${isFinite(stats.minWaitTime) ? stats.minWaitTime.toFixed(2) : 0}ms`,
      `**Maximum:** ${stats.maxWaitTime.toFixed(2)}ms`,
      `**Total Wait:** ${formatDuration(stats.totalWaitTime)}`,
    ].join('\n'),
    inline: true
  });

  // Priority Performance
  const priorityPerf = Object.entries(stats.messagesByPriority)
    .sort(([a], [b]) => parseInt(b) - parseInt(a))
    .slice(0, 5);

  if (priorityPerf.length > 0) {
    embed.addFields({
      name: "🎯 Priority Performance",
      value: priorityPerf.map(([priority, data]) =>
        `**P${priority}:** ${data.processed} msgs, ${data.avgWaitTime.toFixed(1)}ms avg wait`
      ).join('\n'),
      inline: false
    });
  }

  return embed;
}

/**
 * Error analysis embed
 */
function createErrorEmbed(stats: QueueStatistics, health: ReturnType<typeof getQueueHealth>): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Error Analysis")
    .setColor(stats.failed > 0 ? 0xff9900 : 0x00ff00)
    .setTimestamp();

  embed.addFields({
    name: "📊 Error Summary",
    value: [
      `**Total Failed:** ${stats.failed.toLocaleString()}`,
      `**Success Rate:** ${stats.successRate.toFixed(2)}%`,
      `**Total Retries:** ${stats.retries.toLocaleString()}`,
      `**Health Status:** ${health.status.toUpperCase()}`,
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: "🔍 Error Categories",
    value: [
      `**Rate Limits:** ${stats.rateLimitHits.toLocaleString()}`,
      `**Network Errors:** ${stats.networkErrors.toLocaleString()}`,
      `**Timeouts:** ${stats.timeoutErrors.toLocaleString()}`,
      `**Other Errors:** ${stats.failed - stats.rateLimitHits - stats.networkErrors - stats.timeoutErrors}`,
    ].join('\n'),
    inline: true
  });

  // Detailed error breakdown
  const errorEntries = Object.entries(stats.errorsByType)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 8);

  if (errorEntries.length > 0) {
    embed.addFields({
      name: "🔥 Error Types",
      value: errorEntries.map(([type, count]) =>
        `**${type}:** ${count.toLocaleString()}`
      ).join('\n'),
      inline: false
    });
  }

  // Failure rates by message type
  const typeFailures = Object.entries(stats.messagesByType)
    .filter(([, data]) => data.failed > 0)
    .sort(([,a], [,b]) => b.failed - a.failed);

  if (typeFailures.length > 0) {
    embed.addFields({
      name: "📝 Failures by Type",
      value: typeFailures.map(([type, data]) => {
        const total = data.processed + data.failed;
        const failureRate = total > 0 ? (data.failed / total * 100).toFixed(1) : '0';
        return `**${type}:** ${data.failed} (${failureRate}% failure rate)`;
      }).join('\n'),
      inline: false
    });
  }

  return embed;
}

/**
 * Queue details embed
 */
function createQueueDetailsEmbed(stats: QueueStatistics): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📬 Queue Details")
    .setColor(0x9932cc)
    .setTimestamp();

  embed.addFields({
    name: "📋 Queue Status",
    value: [
      `**Current Size:** ${stats.currentQueueSize}`,
      `**Peak Size:** ${stats.peakQueueSize}`,
      `**Total Queued:** ${stats.queuedTotal.toLocaleString()}`,
      `**Backlog Threshold:** ${stats.backlogThreshold}`,
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: "⚙️ Processing Info",
    value: [
      `**Currently Processing:** ${stats.processing ? "Yes" : "No"}`,
      `**Uptime:** ${formatDuration(stats.uptime)}`,
      `**Started:** <t:${Math.floor(stats.startTime.getTime() / 1000)}:R>`,
      `**Last Processed:** ${stats.lastProcessedAt ? `<t:${Math.floor(stats.lastProcessedAt.getTime() / 1000)}:R>` : "Never"}`,
    ].join('\n'),
    inline: true
  });

  // Priority distribution
  const priorityDist = Object.entries(stats.messagesByPriority)
    .sort(([a], [b]) => parseInt(b) - parseInt(a));

  if (priorityDist.length > 0) {
    embed.addFields({
      name: "🎯 Priority Distribution",
      value: priorityDist.map(([priority, data]) =>
        `**Priority ${priority}:** ${(data.processed + data.failed).toLocaleString()} total`
      ).join('\n'),
      inline: false
    });
  }

  return embed;
}

/**
 * Message types breakdown embed
 */
function createMessageTypesEmbed(stats: QueueStatistics): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📝 Message Types Analysis")
    .setColor(0xff6b6b)
    .setTimestamp();

  const typeEntries = Object.entries(stats.messagesByType)
    .sort(([,a], [,b]) => b.processed - a.processed);

  typeEntries.forEach(([type, data]) => {
    const total = data.processed + data.failed;
    const successRate = total > 0 ? (data.processed / total * 100).toFixed(1) : '100';

    embed.addFields({
      name: `📄 ${type.replace(/_/g, ' ').toUpperCase()}`,
      value: [
        `**Processed:** ${data.processed.toLocaleString()}`,
        `**Failed:** ${data.failed.toLocaleString()}`,
        `**Retries:** ${data.retries.toLocaleString()}`,
        `**Success Rate:** ${successRate}%`,
        `**Avg Processing:** ${data.avgProcessingTime.toFixed(2)}ms`,
      ].join('\n'),
      inline: true
    });
  });

  return embed;
}

/**
 * Health-focused embed
 */
function createHealthEmbed(stats: QueueStatistics, health: ReturnType<typeof getQueueHealth>): EmbedBuilder {
  const healthColor = stats.isHealthy ? 0x00ff00 : 0xff0000;
  const healthIcon = stats.isHealthy ? "🟢" : "🔴";

  const embed = new EmbedBuilder()
    .setTitle(`${healthIcon} Queue Health Check`)
    .setColor(healthColor)
    .setTimestamp();

  embed.addFields({
    name: "🏥 Overall Health",
    value: [
      `**Status:** ${health.status.toUpperCase()}`,
      `**Is Healthy:** ${stats.isHealthy ? "Yes" : "No"}`,
      `**Success Rate:** ${stats.successRate.toFixed(2)}%`,
      `**Queue Backlog:** ${health.queueBacklog ? "Yes" : "No"}`,
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: "📊 Key Metrics",
    value: [
      `**Current Queue:** ${stats.currentQueueSize}/${stats.backlogThreshold}`,
      `**Processing:** ${stats.processing ? "Active" : "Idle"}`,
      `**Throughput:** ${stats.throughputPerMinute.toFixed(1)}/min`,
      `**Uptime:** ${formatDuration(stats.uptime)}`,
    ].join('\n'),
    inline: true
  });

  // Health recommendations
  const recommendations: string[] = [];
  if (stats.successRate < 95) recommendations.push("• Low success rate detected");
  if (stats.currentQueueSize >= stats.backlogThreshold) recommendations.push("• Queue backlog present");
  if (stats.rateLimitHits > 10) recommendations.push("• High rate limit hits");
  if (stats.avgProcessingTime > 1000) recommendations.push("• Slow processing detected");

  if (recommendations.length > 0) {
    embed.addFields({
      name: "⚠️ Recommendations",
      value: recommendations.join('\n'),
      inline: false
    });
  } else {
    embed.addFields({
      name: "✅ System Status",
      value: "All systems operating normally!",
      inline: false
    });
  }

  return embed;
}

/**
 * Detailed/full statistics embed
 */
function createDetailedEmbed(stats: QueueStatistics): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📊 Detailed Queue Statistics")
    .setColor(0x7289da)
    .setTimestamp();

  // Note about character limits
  embed.setDescription("⚠️ **Full statistics view** - Some data may be truncated due to Discord limits");

  // Summary stats
  embed.addFields({
    name: "📈 Summary",
    value: [
      `**Processed:** ${stats.processed.toLocaleString()}`,
      `**Failed:** ${stats.failed.toLocaleString()}`,
      `**Success Rate:** ${stats.successRate.toFixed(2)}%`,
      `**Uptime:** ${formatDuration(stats.uptime)}`,
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: "⚡ Performance",
    value: [
      `**Throughput:** ${stats.throughputPerMinute.toFixed(1)}/min`,
      `**Avg Processing:** ${stats.avgProcessingTime.toFixed(2)}ms`,
      `**Queue Size:** ${stats.currentQueueSize}`,
      `**Peak Size:** ${stats.peakQueueSize}`,
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: "🔥 Errors",
    value: [
      `**Rate Limits:** ${stats.rateLimitHits}`,
      `**Network:** ${stats.networkErrors}`,
      `**Timeouts:** ${stats.timeoutErrors}`,
      `**Retries:** ${stats.retries}`,
    ].join('\n'),
    inline: true
  });

  embed.setFooter({
    text: "Use specific statistic types (performance, errors, queue, types, health) for detailed views"
  });

  return embed;
}

// formatDuration is now imported from index.ts

/**
 * Helper function to get available statistic types for help text
 */
export function getAvailableStatisticTypes(): string[] {
  return [
    'overview (default)',
    'performance - Throughput and timing metrics',
    'errors - Error analysis and failure rates',
    'queue - Queue status and processing info',
    'types - Message type breakdown',
    'health - System health check',
    'detailed - Full statistics view'
  ];
}

/**
 * Create a simple help embed for the statistics command
 */
export function createStatsHelpEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📊 Queue Statistics Help")
    .setColor(0x7289da)
    .setDescription("Available statistic types:")
    .addFields({
      name: "📋 Statistic Types",
      value: getAvailableStatisticTypes().map(type => `• \`${type}\``).join('\n'),
      inline: false
    })
    .setFooter({ text: "Use: /stats [statistic: type]" });

  return embed;
}