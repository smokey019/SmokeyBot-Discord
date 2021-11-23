"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomNature = exports.getNatures = void 0;
const utils_1 = require("../../utils");
const natures_json_1 = __importDefault(require("./data/natures.json"));
/**
 * Returns all "natures".
 */
function getNatures() {
    return natures_json_1.default;
}
exports.getNatures = getNatures;
/**
 * Returns a random "nature" value.
 */
function getRandomNature() {
    return natures_json_1.default[(0, utils_1.getRndInteger)(0, natures_json_1.default.length - 1)].type;
}
exports.getRandomNature = getRandomNature;
