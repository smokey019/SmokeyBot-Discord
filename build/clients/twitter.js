'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.twitterClient = void 0;
const twitter_lite_1 = __importDefault(require('twitter-lite'));
const config_1 = require('../config');
const consumerKey = (0, config_1.getConfigValue)('TWITTER_CONSUMER_KEY');
const consumerSecret = (0, config_1.getConfigValue)('TWITTER_CONSUMER_SECRET');
if (!consumerKey) {
  throw new Error('TWITTER_CONSUMER_KEY is missing in the config');
}
if (!consumerSecret) {
  throw new Error('TWITTER_CONSUMER_SECRET is missing in the config');
}
exports.twitterClient = new twitter_lite_1.default({
  access_token_key: (0, config_1.getConfigValue)('TWITTER_ACCESS_TOKEN_KEY'),
  access_token_secret: (0, config_1.getConfigValue)(
    'TWITTER_ACCESS_TOKEN_SECRET',
  ),
  consumer_key: consumerKey,
  consumer_secret: consumerSecret,
});
