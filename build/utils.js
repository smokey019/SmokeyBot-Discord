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
exports.explode = exports.chunk = exports.jsonFetch = exports.format_number = exports.getTimeInterval = exports.theWord = exports.getCurrentTime = exports.getRndInteger = exports.asyncForEach = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const datetime_difference_1 = __importDefault(require("datetime-difference"));
const moment_1 = __importDefault(require("moment"));
const node_fetch_1 = __importDefault(require("node-fetch"));
function asyncForEach(array, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let index = 0; index < array.length; index++) {
            yield callback(array[index], index, array);
        }
    });
}
exports.asyncForEach = asyncForEach;
/**
 * Random number between X and Y
 * @param min
 * @param max
 */
function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
exports.getRndInteger = getRndInteger;
/**
 * PHP (Better) Timestamp
 */
function getCurrentTime() {
    return Math.floor(Date.now() / 1000);
}
exports.getCurrentTime = getCurrentTime;
/**
 * returns POKéMON
 */
function theWord() {
    return 'POKéMON';
}
exports.theWord = theWord;
function getTimeInterval(datetime) {
    const liveAt = new Date((0, moment_1.default)(datetime).format('MM/DD/YYYY, hh:mm:ss A'));
    const timeNow = new Date();
    const diff = (0, datetime_difference_1.default)(liveAt, timeNow);
    const string = {
        years: 'year',
        months: 'month',
        weeks: 'week',
        days: 'day',
        hours: 'hour',
        minutes: 'minute',
        seconds: 'second',
        //milliseconds: 'millisecond'
    };
    const finishedString = [];
    Object.keys(string).forEach(function (key) {
        // do something with string[key]
        if (diff[key] > 1) {
            string[key] = diff[key] + ' ' + string[key] + 's';
            finishedString.push(string[key]);
        }
        else if (diff[key] == 1) {
            string[key] = diff[key] + ' ' + string[key];
            finishedString.push(string[key]);
        }
        else {
            delete string[key];
        }
    });
    const actuallyFinish = finishedString.join(', ');
    return actuallyFinish;
}
exports.getTimeInterval = getTimeInterval;
/**
 * Format big numbers with commas.
 * @param num
 */
function format_number(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}
exports.format_number = format_number;
/**
 * Fetch json from URL.
 * @param {string} url URL String
 */
const jsonFetch = (url) => (0, node_fetch_1.default)(url, {
    method: 'GET',
}).then((res) => __awaiter(void 0, void 0, void 0, function* () { return res.json(); }));
exports.jsonFetch = jsonFetch;
/**
 * Split an array into other arrays.
 * @param arr Array
 * @param len # of Objects Per Array
 */
function chunk(arr, len) {
    const chunks = [];
    let i = 0;
    const n = arr.length;
    while (i < n) {
        chunks.push(arr.slice(i, (i += len)));
    }
    return chunks;
}
exports.chunk = chunk;
/**
 * Split string but with a limit.
 * PHP Function
 * @param string
 * @param separator
 * @param limit
 */
function explode(string, separator, limit) {
    const array = string.split(separator);
    if (limit !== undefined && array.length >= limit) {
        array.push(array.splice(limit - 1).join(separator));
    }
    return array;
}
exports.explode = explode;
