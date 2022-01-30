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
exports.sumSmash = exports.gtfo = exports.checkVase = exports.checkTweet = exports.check_tweets = void 0;
const discord_js_1 = require("discord.js");
const cache_1 = require("../../clients/cache");
const logger_1 = require("../../clients/logger");
const twitter_1 = require("../../clients/twitter");
const utils_1 = require("../../utils");
const logger = (0, logger_1.getLogger)('SmokeyBot');
function check_tweets(user, message, tweet_count = 1) {
    return __awaiter(this, void 0, void 0, function* () {
        const timestamp = (0, utils_1.getCurrentTime)();
        const cache = yield cache_1.cacheClient.get(message.guild.id);
        const params = {
            screen_name: user,
            count: tweet_count,
        };
        const GCD = yield (0, cache_1.getGCD)(message.guild.id);
        if (message.member.permissions.has([discord_js_1.Permissions.FLAGS.ADMINISTRATOR]) ||
            timestamp - GCD > 10) {
            cache_1.GLOBAL_COOLDOWN.set(message.guild.id, (0, utils_1.getCurrentTime)());
            twitter_1.twitterClient.get('statuses/user_timeline', params).then((tweets) => {
                if (cache.tweet) {
                    if (cache.tweet.id != tweets[0].id) {
                        // new tweet
                        cache.tweet = tweets[0];
                        send_tweet_message(tweets[0], message);
                    }
                    else {
                        // same tweet, respond tho xd
                        cache.tweet = tweets[0];
                        send_tweet_message(tweets[0], message);
                    }
                }
                else {
                    cache.tweet = tweets[0];
                    send_tweet_message(tweets[0], message);
                }
            });
        }
    });
}
exports.check_tweets = check_tweets;
/**
 * Send a Message w/ Tweet
 * @param tweet
 * @param message
 */
function send_tweet_message(tweet, message) {
    return __awaiter(this, void 0, void 0, function* () {
        //if (tweet.text.charAt(0) != "@") {
        const embed = new discord_js_1.MessageEmbed()
            .setTitle(`*Latest Tweet*`)
            .setColor('BLUE')
            .setDescription(tweet.text +
            `\n\n *https://twitter.com/${tweet.user.name}/status/${tweet.id_str}*`)
            .setAuthor(tweet.user.name, tweet.user.profile_image_url_https, `https://twitter.com/${tweet.user.name}`)
            .setTimestamp(tweet.created_at)
            .setFooter('Twitter', 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png');
        // .setURL(`https://twitter.com/${tweet.user.name}/status/${tweet.id_str}`);
        yield message.channel
            .send({ embeds: [embed] })
            .then((message) => {
            return message;
        })
            .catch((err) => {
            logger.error(err);
        });
        //}
    });
}
function send_image_message(message, image, color = 0x00bc8c, delete_after = false, delete_timer = 6000) {
    return __awaiter(this, void 0, void 0, function* () {
        const embed = new discord_js_1.MessageEmbed()
            // .setTitle('<:sumSmash:454911973868699648>')
            .setColor(color)
            // .setDescription()
            .setImage(image);
        yield message.channel
            .send({ embeds: [embed] })
            .then((tmpMsg) => {
            if (delete_after && delete_timer > 1000) {
                setTimeout(delete_message, delete_timer, message, tmpMsg.id);
                setTimeout(delete_message, delete_timer, message, message.id);
            }
        })
            .catch((err) => {
            logger.error(err);
        });
    });
}
function delete_message(message, msg_id) {
    return __awaiter(this, void 0, void 0, function* () {
        message.channel.messages
            .fetch(msg_id)
            .then((message) => {
            message.delete();
        })
            .catch((err) => {
            logger.error(err);
        });
    });
}
function checkTweet(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const twitter = yield cache_1.cacheTwitter.get(message.guild.id);
        check_tweets(twitter, message);
    });
}
exports.checkTweet = checkTweet;
function checkVase(message) {
    return __awaiter(this, void 0, void 0, function* () {
        setTimeout(send_image_message, 250, message, 'https://media.discordapp.net/attachments/238772427960614912/698266752542572624/mHXydsWErf.gif', 0x00bc8c, true, 7000);
    });
}
exports.checkVase = checkVase;
function gtfo(message) {
    return __awaiter(this, void 0, void 0, function* () {
        setTimeout(send_image_message, 250, message, 'https://cdn.discordapp.com/attachments/238494640758587394/699139113605136404/VsSMgcJwSp.gif');
    });
}
exports.gtfo = gtfo;
function sumSmash(message) {
    return __awaiter(this, void 0, void 0, function* () {
        setTimeout(send_image_message, 250, message, 'https://i.imgur.com/0Ns0tYf.gif');
    });
}
exports.sumSmash = sumSmash;
