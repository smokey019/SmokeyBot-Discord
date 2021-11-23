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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBoostedWeatherSpawns = void 0;
const cache_1 = require("../../clients/cache");
const utils_1 = require("../../utils");
const weather_json_1 = __importDefault(require("./data/weather.json"));
const WEATHER_CACHE = (0, cache_1.loadCache)('weather', 100);
function getBoostedWeatherSpawns(message, cache) {
    return __awaiter(this, void 0, void 0, function* () {
        const boost = yield WEATHER_CACHE.get(message.guild.id);
        if (!boost) {
            const weather = yield change_weather(message, cache);
            return weather;
        }
        else {
            if (Date.now() - boost.time > 60 * 1000 * (0, utils_1.getRndInteger)(5, 15)) {
                const weather = yield change_weather(message, cache);
                return weather;
            }
            else {
                return boost.weather;
            }
        }
    });
}
exports.getBoostedWeatherSpawns = getBoostedWeatherSpawns;
function change_weather(message, cache) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const boost = {
            weather: weather_json_1.default[(0, utils_1.getRndInteger)(0, weather_json_1.default.length - 1)],
            time: Date.now(),
        };
        WEATHER_CACHE.set(message.guild.id, boost);
        const monsterChannel = (_a = message.guild) === null || _a === void 0 ? void 0 : _a.channels.cache.find((ch) => ch.name === cache.settings.specific_channel);
        monsterChannel.send(`The weather has changed!  It is now **${boost.weather.weather}**.  You will find increased spawns of **${boost.weather.boosts.join(' / ')}** on this server.`);
        return boost.weather;
    });
}
