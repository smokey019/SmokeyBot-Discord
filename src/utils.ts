import fetch from 'node-fetch';

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
  return 'POKéMON';
}

/**
 * Format big numbers with commas.
 * @param num
 */
export function format_number(num: number): string {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}

/**
 * Fetch json from URL.
 * @param {string} url URL String
 */
export const jsonFetch = (url: string): Promise<unknown> =>
  fetch(url, {
    method: 'GET',
  }).then(async (res) => res.json());

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
  limit: number,
): Array<string> {
  const array = string.split(separator);
  if (limit !== undefined && array.length >= limit) {
    array.push(array.splice(limit - 1).join(separator));
  }
  return array;
}
