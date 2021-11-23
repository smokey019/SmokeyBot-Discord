"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLOR_CUSTOM = exports.COLOR_YELLOW = exports.COLOR_PURPLE = exports.COLOR_PINK = exports.COLOR_CYAN = exports.COLOR_ORANGE = exports.COLOR_GREEN = exports.COLOR_RED = exports.COLOR_BLUE = exports.COLOR_WHITE = exports.COLOR_BLACK = void 0;
exports.COLOR_BLACK = 0x000000;
exports.COLOR_WHITE = 0xffffff;
exports.COLOR_BLUE = 0x003cff;
exports.COLOR_RED = 0xff0000;
exports.COLOR_GREEN = 0x41c600;
exports.COLOR_ORANGE = 0xff6000;
exports.COLOR_CYAN = 0x00ffde;
exports.COLOR_PINK = 0xf000ff;
exports.COLOR_PURPLE = 0x6000ff;
exports.COLOR_YELLOW = 0xfcff00;
/**
 * Custom color converted to hex number color. Possibly.
 * @param hex Web Hex # (ie: FFFFFF)
 */
function COLOR_CUSTOM(hex) {
    hex = hex.toString();
    return parseInt('0x' + hex);
}
exports.COLOR_CUSTOM = COLOR_CUSTOM;
