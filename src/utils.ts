import fetch from 'node-fetch';

export function getRndInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getCurrentTime(): number {
  return Math.floor(Date.now() / 1000);
}

export function theWord(): string {
  return 'POKéMON';
}

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
