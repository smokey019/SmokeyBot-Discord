"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCache = exports.getGCD = exports.clearCache = exports.reportCache = exports.loadCache = exports.SMOKEYBOT_GLOBAL_SETTINGS_CACHE = exports.GLOBAL_COOLDOWN = exports.cacheToBeDeleted = exports.cacheTweets = exports.cacheTwitter = exports.xp_cache = exports.cacheClient = exports.caches = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const discord_js_1 = require("discord.js");
const mnemonist_1 = require("mnemonist");
const utils_1 = require("../utils");
exports.caches = new discord_js_1.Collection();
const defaultCache = '$default';
exports.cacheClient = loadCache('cacheClient', 100);
exports.xp_cache = loadCache('xp_cache', 50);
exports.cacheTwitter = loadCache('cacheTwitter', 15);
exports.cacheTweets = loadCache('cacheTweets', 15);
exports.cacheToBeDeleted = loadCache('cacheToBeDeleted', 15);
exports.GLOBAL_COOLDOWN = loadCache('GLOBAL_COOLDOWN', 15);
exports.SMOKEYBOT_GLOBAL_SETTINGS_CACHE = loadCache('GLOBAL_SETTINGS_CACHE');
/**
 * Spawn/load a cache.
 * @param category Cache name.
 * @returns Lru
 */
function loadCache(category = defaultCache, maximum = 100) {
    if (!exports.caches.has(category)) {
        const newCache = new mnemonist_1.LRUCache(maximum);
        exports.caches.set(category, newCache);
        return newCache;
    }
    else {
        return exports.caches.get(category);
    }
}
exports.loadCache = loadCache;
function reportCache(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const report = [];
        report.push('Cache Reports:\n');
        for (const [key, value] of exports.caches) {
            report.push(`**${key}** has **${value.size}** entries.`);
        }
        yield message.reply(report.join('\n'));
    });
}
exports.reportCache = reportCache;
/**
 * Clear a particular cache or `all`.
 * @param category Cache name. Use `all` for clearing all caches.
 * @returns boolean
 */
function clearCache(category = defaultCache) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        if (category == 'all') {
            exports.caches.forEach((element) => {
                element.clear();
            });
            return true;
        }
        else {
            if (exports.caches.has(category)) {
                (_a = exports.caches.get(category)) === null || _a === void 0 ? void 0 : _a.clear();
                return true;
            }
            else {
                return false;
            }
        }
    });
}
exports.clearCache = clearCache;
/**
 * Retrieve cached GCD if available.
 * @param guild_id
 * @returns
 */
function getGCD(guild_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const GCD = yield (exports.GLOBAL_COOLDOWN === null || exports.GLOBAL_COOLDOWN === void 0 ? void 0 : exports.GLOBAL_COOLDOWN.get(guild_id));
        const timestamp = (0, utils_1.getCurrentTime)();
        if (!GCD) {
            yield (exports.GLOBAL_COOLDOWN === null || exports.GLOBAL_COOLDOWN === void 0 ? void 0 : exports.GLOBAL_COOLDOWN.set(guild_id, timestamp - 15));
            return timestamp - 15;
        }
        else {
            return GCD;
        }
    });
}
exports.getGCD = getGCD;
function getCache(message, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        let cache = yield (exports.cacheClient === null || exports.cacheClient === void 0 ? void 0 : exports.cacheClient.get(message.guild.id));
        if (!cache) {
            cache = {
                tweet: [],
                settings: {
                    id: settings.id,
                    guild_id: settings.guild_id,
                    smokemon_enabled: settings.smokemon_enabled,
                    specific_channel: settings.specific_channel,
                },
            };
            exports.cacheClient === null || exports.cacheClient === void 0 ? void 0 : exports.cacheClient.set(message.guild.id, cache);
            exports.cacheTwitter === null || exports.cacheTwitter === void 0 ? void 0 : exports.cacheTwitter.set(message.guild.id, 'summit1g');
            return cache;
        }
        else {
            return cache;
        }
    });
}
exports.getCache = getCache;
