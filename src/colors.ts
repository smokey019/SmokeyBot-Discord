export const COLOR_BLACK = 0x000000;
export const COLOR_WHITE = 0xffffff;
export const COLOR_BLUE = 0x003cff;
export const COLOR_RED = 0xff0000;
export const COLOR_GREEN = 0x41c600;
export const COLOR_ORANGE = 0xff6000;
export const COLOR_CYAN = 0x00ffde;
export const COLOR_PINK = 0xf000ff;
export const COLOR_PURPLE = 0x6000ff;
export const COLOR_YELLOW = 0xfcff00;

/**
 * Custom color converted to hex number color. Possibly.
 * @param hex Web Hex # (ie: FFFFFF)
 */
export function COLOR_CUSTOM(hex: number | string): number {
  hex = hex.toString();

  return parseInt('0x' + hex);
}
