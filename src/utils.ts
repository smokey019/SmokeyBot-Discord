export function getRndInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getCurrentTime(): number {
  return Math.floor(Date.now() / 1000)
}
