
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
export function format_number(num: number): string {
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
