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
