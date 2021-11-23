"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigValue = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const config = dotenv_1.default.config({
    debug: process.env.NODE_ENV !== 'production',
});
/**
 * Returns the Config value for the specified key.
 *
 * @param key Config key to receive the value for.
 */
function getConfigValue(key) {
    var _a;
    return (_a = config.parsed) === null || _a === void 0 ? void 0 : _a[key];
}
exports.getConfigValue = getConfigValue;
