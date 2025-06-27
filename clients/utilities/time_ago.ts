/**
 * Localized relative date/time formatting utility
 * Automatically chooses the right units and supports both past and future dates
 */

export interface RelativeTimeOptions {
  /** Locale for formatting (defaults to user's locale) */
  locale?: string | string[];
  /** Style of formatting: 'long', 'short', or 'narrow' */
  style?: 'long' | 'short' | 'narrow';
  /** Numeric formatting: 'always' or 'auto' */
  numeric?: 'always' | 'auto';
  /** Custom threshold for "just now" in milliseconds (default: 30000) */
  justNowThreshold?: number;
}

export interface TimeUnit {
  unit: Intl.RelativeTimeFormatUnit;
  milliseconds: number;
}

// Time units in milliseconds (largest to smallest for proper selection)
const TIME_UNITS: TimeUnit[] = [
  { unit: 'year', milliseconds: 31536000000 },    // 365 days
  { unit: 'month', milliseconds: 2628000000 },    // 30.44 days average
  { unit: 'week', milliseconds: 604800000 },      // 7 days
  { unit: 'day', milliseconds: 86400000 },        // 24 hours
  { unit: 'hour', milliseconds: 3600000 },        // 60 minutes
  { unit: 'minute', milliseconds: 60000 },        // 60 seconds
  { unit: 'second', milliseconds: 1000 },         // 1000ms
];

/**
 * Formats a date as a localized relative time string
 * @param date - The date to format (Date object, timestamp, or date string)
 * @param options - Formatting options
 * @returns Formatted relative time string
 */
export function formatRelativeTime(
  date: Date | number | string,
  options: RelativeTimeOptions = {}
): string {
  const {
    locale,
    style = 'long',
    numeric = 'auto',
    justNowThreshold = 30000, // 30 seconds
  } = options;

  // Convert input to Date object
  const targetDate = new Date(date);
  const now = new Date();

  // Validate date
  if (isNaN(targetDate.getTime())) {
    throw new Error('Invalid date provided');
  }

  // Calculate difference in milliseconds
  const diffMs = targetDate.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);

  // Handle "just now" case
  if (absDiffMs < justNowThreshold) {
    if (numeric === 'always') {
      const formatter = new Intl.RelativeTimeFormat(locale, { style, numeric });
      return formatter.format(0, 'second');
    }
    return 'just now';
  }

  // Find the appropriate time unit
  const timeUnit = findBestTimeUnit(absDiffMs);

  // Calculate the value in the chosen unit
  const value = Math.round(diffMs / timeUnit.milliseconds);

  // Create formatter and return result
  const formatter = new Intl.RelativeTimeFormat(locale, { style, numeric });
  return formatter.format(value, timeUnit.unit);
}

/**
 * Finds the best time unit for the given time difference
 * @param absDiffMs - Absolute difference in milliseconds
 * @returns The most appropriate time unit
 */
function findBestTimeUnit(absDiffMs: number): TimeUnit {
  // For very small differences, use seconds
  if (absDiffMs < TIME_UNITS[TIME_UNITS.length - 1].milliseconds) {
    return TIME_UNITS[TIME_UNITS.length - 1]; // seconds
  }

  // Find the largest unit where the value would be >= 1
  for (const unit of TIME_UNITS) {
    if (absDiffMs >= unit.milliseconds) {
      return unit;
    }
  }

  // Fallback to seconds (shouldn't reach here)
  return TIME_UNITS[TIME_UNITS.length - 1];
}

/**
 * Formats multiple dates as relative times
 * @param dates - Array of dates to format
 * @param options - Formatting options
 * @returns Array of formatted relative time strings
 */
export function formatRelativeTimes(
  dates: (Date | number | string)[],
  options: RelativeTimeOptions = {}
): string[] {
  return dates.map(date => formatRelativeTime(date, options));
}

/**
 * Creates a reusable relative time formatter with preset options
 * @param options - Default formatting options
 * @returns Function that formats dates with the preset options
 */
export function createRelativeTimeFormatter(options: RelativeTimeOptions = {}) {
  return (date: Date | number | string, overrideOptions?: Partial<RelativeTimeOptions>): string => {
    return formatRelativeTime(date, { ...options, ...overrideOptions });
  };
}

/**
 * Gets the time difference in the most appropriate unit
 * @param date - The date to compare against now
 * @returns Object with value and unit
 */
export function getTimeDifference(date: Date | number | string): { value: number; unit: string; isPast: boolean } {
  const targetDate = new Date(date);
  const now = new Date();

  if (isNaN(targetDate.getTime())) {
    throw new Error('Invalid date provided');
  }

  const diffMs = targetDate.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isPast = diffMs < 0;

  const timeUnit = findBestTimeUnit(absDiffMs);
  const value = Math.abs(Math.round(diffMs / timeUnit.milliseconds));

  return {
    value,
    unit: timeUnit.unit,
    isPast,
  };
}

// Example usage and exports
export default formatRelativeTime;

/**
 * Example usage:
 *
 * import { formatRelativeTime, createRelativeTimeFormatter } from './relative-time-formatter';
 *
 * // Basic usage
 * console.log(formatRelativeTime(new Date(Date.now() - 30000))); // "30 seconds ago"
 * console.log(formatRelativeTime(new Date(Date.now() + 3600000))); // "in 1 hour"
 *
 * // With options
 * console.log(formatRelativeTime(new Date(Date.now() - 30000), { style: 'short' })); // "30 sec. ago"
 * console.log(formatRelativeTime(new Date(Date.now() - 30000), { style: 'narrow' })); // "30s ago"
 *
 * // Different locales
 * console.log(formatRelativeTime(new Date(Date.now() - 3600000), { locale: 'es' })); // "hace 1 hora"
 * console.log(formatRelativeTime(new Date(Date.now() + 86400000), { locale: 'fr' })); // "dans 1 jour"
 *
 * // Create reusable formatter
 * const shortFormatter = createRelativeTimeFormatter({ style: 'short' });
 * console.log(shortFormatter(new Date(Date.now() - 300000))); // "5 min. ago"
 */