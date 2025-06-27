import datetimeDifference from "datetime-difference";
import moment from "moment";

export async function asyncForEach(array, callback): Promise<void> {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

/**
 * Random number between X and Y
 * @param min
 * @param max
 */
export function getRndInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * PHP (Better) Timestamp
 */
export function getCurrentTime(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * returns POKéMON
 */
export function theWord(): string {
  return "POKéMON";
}

export function getTimeInterval(datetime: string): string {
  const liveAt = new Date(moment(datetime).format("MM/DD/YYYY, hh:mm:ss A"));
  const timeNow = new Date();

  const diff = datetimeDifference(liveAt, timeNow);

  const string = {
    years: "year",
    months: "month",
    weeks: "week",
    days: "day",
    hours: "hour",
    minutes: "minute",
    seconds: "second",
    //milliseconds: 'millisecond'
  };

  const finishedString = [];

  Object.keys(string).forEach(function (key) {
    // do something with string[key]
    if (diff[key] > 1) {
      string[key] = diff[key] + " " + string[key] + "s";
      finishedString.push(string[key]);
    } else if (diff[key] == 1) {
      string[key] = diff[key] + " " + string[key];
      finishedString.push(string[key]);
    } else {
      delete string[key];
    }
  });

  const actuallyFinish = finishedString.join(", ");

  return actuallyFinish;
}

/**
 * Format big numbers with commas.
 * @param num
 */
export function format_number(num: number | string): string {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}

/**
 * Bun Fetch
 * @param url
 * @returns JSON object
 */
export async function jsonFetch(url: string): Promise<any> {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  return response.json();
}

/**
 * Split an array into other arrays.
 * @param arr Array
 * @param len # of Objects Per Array
 */
export function chunk(arr: Array<any>, len: number): Array<any> {
  const chunks = [];
  let i = 0;
  const n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, (i += len)));
  }

  return chunks;
}

/**
 * Split string but with a limit.
 * PHP Function
 * @param string
 * @param separator
 * @param limit
 */
export function explode(
  string: string,
  separator: string,
  limit: number
): Array<string> {
  const array = string.split(separator);
  if (limit !== undefined && array.length >= limit) {
    array.push(array.splice(limit - 1).join(separator));
  }
  return array;
}

/**
 * Converts milliseconds to a human-readable time format
 * @param milliseconds - The time in milliseconds to convert
 * @param options - Configuration options for the output format
 * @returns Formatted time string
 */
interface TimeFormatOptions {
  /** Include decimal places for sub-second precision */
  precision?: number;
  /** Use short format (s, m, h) instead of full words */
  short?: boolean;
  /** Maximum unit to display (prevents showing days/hours when not needed) */
  maxUnit?: "seconds" | "minutes" | "hours" | "days";
  /** Minimum unit to display */
  minUnit?: "milliseconds" | "seconds" | "minutes" | "hours";
  /** Include all units even if zero */
  includeZeros?: boolean;
}

/**
 * Convert milliseconds to human-readable time format
 */
export function formatTime(
  milliseconds: number,
  options: TimeFormatOptions = {}
): string {
  const {
    precision = 1,
    short = false,
    maxUnit = "days",
    minUnit = "milliseconds",
    includeZeros = false,
  } = options;

  // Handle edge cases
  if (milliseconds < 0) {
    return short ? "0ms" : "0 milliseconds";
  }

  if (milliseconds === 0) {
    return short ? "0ms" : "0 milliseconds";
  }

  // Time conversion constants
  const units = [
    { name: "day", short: "d", value: 24 * 60 * 60 * 1000 },
    { name: "hour", short: "h", value: 60 * 60 * 1000 },
    { name: "minute", short: "m", value: 60 * 1000 },
    { name: "second", short: "s", value: 1000 },
    { name: "millisecond", short: "ms", value: 1 },
  ];

  // Find the appropriate units based on maxUnit and minUnit
  const maxUnitIndex = units.findIndex((unit) => unit.name.startsWith(maxUnit));
  const minUnitIndex = units.findIndex((unit) => unit.name.startsWith(minUnit));

  const relevantUnits = units.slice(maxUnitIndex, minUnitIndex + 1);

  // Calculate time components
  let remaining = milliseconds;
  const components: Array<{ value: number; unit: (typeof units)[0] }> = [];

  for (const unit of relevantUnits) {
    const value = Math.floor(remaining / unit.value);
    remaining = remaining % unit.value;

    if (value > 0 || includeZeros) {
      components.push({ value, unit });
    }
  }

  // Handle sub-second precision for seconds
  if (minUnit === "seconds" && remaining > 0 && components.length > 0) {
    const lastComponent = components[components.length - 1];
    if (lastComponent.unit.name === "second") {
      const fractionalSeconds = remaining / 1000;
      lastComponent.value = parseFloat(
        (lastComponent.value + fractionalSeconds).toFixed(precision)
      );
    }
  }

  // Format the output
  if (components.length === 0) {
    // Fallback for very small values
    if (milliseconds < 1000) {
      return short
        ? `${milliseconds}ms`
        : `${milliseconds} millisecond${milliseconds !== 1 ? "s" : ""}`;
    }
    return short ? "0s" : "0 seconds";
  }

  // Create formatted strings
  const formatted = components.map(({ value, unit }) => {
    const unitName = short ? unit.short : unit.name + (value !== 1 ? "s" : "");
    const displayValue =
      unit.name === "second" && precision > 0 && !Number.isInteger(value)
        ? value.toFixed(precision)
        : value.toString();

    return short ? `${displayValue}${unitName}` : `${displayValue} ${unitName}`;
  });

  return formatted.join(short ? " " : ", ");
}

/**
 * Simple converter that automatically chooses the best unit
 * Perfect for most use cases - converts to seconds if >= 60s, otherwise milliseconds
 */
export function msToTime(milliseconds: number): string {
  if (milliseconds >= 60000) {
    // 60 seconds or more - show minutes and seconds
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);

    if (minutes > 0 && seconds > 0) {
      return `${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  } else if (milliseconds >= 1000) {
    // 1 second or more - show seconds with decimal
    const seconds = (milliseconds / 1000).toFixed(1);
    return `${seconds}s`;
  } else {
    // Less than 1 second - show milliseconds
    return `${milliseconds}ms`;
  }
}

/**
 * Ultra-compact converter for space-constrained displays
 */
export function msToCompact(milliseconds: number): string {
  if (milliseconds >= 3600000) return `${(milliseconds / 3600000).toFixed(1)}h`; // Hours
  if (milliseconds >= 60000) return `${(milliseconds / 60000).toFixed(1)}m`; // Minutes
  if (milliseconds >= 1000) return `${(milliseconds / 1000).toFixed(1)}s`; // Seconds
  return `${milliseconds}ms`; // Milliseconds
}

/**
 * Detailed converter for logging and debugging
 */
export function msToDetailed(milliseconds: number): string {
  return formatTime(milliseconds, {
    precision: 2,
    short: false,
    maxUnit: "hours",
    minUnit: "milliseconds",
    includeZeros: false,
  });
}

/**
 * Uptime formatter specifically for bot statistics
 */
export function formatUptime(milliseconds: number): string {
  const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
  const hours = Math.floor(
    (milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
  );
  const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));

  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(" ") : "< 1m";
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

// Example usage:
// console.log(msToTime(500));        // "500ms"
// console.log(msToTime(1500));       // "1.5s"
// console.log(msToTime(65000));      // "1m 5s"
// console.log(msToTime(125000));     // "2m 5s"

// console.log(msToCompact(125000));  // "2.1m"
// console.log(msToDetailed(125000)); // "2 minutes, 5 seconds"

// console.log(formatUptime(259200000)); // "3d"
// console.log(formatUptime(7200000));   // "2h"

// Advanced formatting:
// console.log(formatTime(125000, { short: true, precision: 2 }));     // "2m 5.00s"
// console.log(formatTime(125000, { short: false, maxUnit: 'minutes' })); // "2 minutes, 5 sec
