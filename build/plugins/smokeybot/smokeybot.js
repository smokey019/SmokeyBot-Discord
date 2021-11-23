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
/*
async function delete_role(value: any, message: Message) {
    value
        .delete(
            `Color role. Deleted by SmokeyBot - initiated by ${message.author}.`,
        )
        .then((deleted) => logger.debug(`Deleted role ${deleted.name}`))
        .catch((err) => logger.error(err));
}*/
function checkTweet(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const twitter = yield cache_1.cacheTwitter.get(message.guild.id);
        check_tweets(twitter, message);
    });
}
exports.checkTweet = checkTweet;
/*
export async function checkColorRoles(message: Message): Promise<void> {
    logger.info(
        `Checking for color roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
    );

    const cached_roles = await message.guild.roles.fetch();
    let color_roles = 0;

    let embed = new MessageEmbed()
        // Set the title of the field
        .setTitle('Role Manager')
        // Set the color of the embed
        .setColor(0xff0000)
        // Set the main content of the embed
        .setDescription(`Checking for color roles.`);
    // Send the embed to the same channel as the message
    await message.channel
        .send({ embeds: [embed] })
        .then(async (message) => {
            await cacheToBeDeleted.set(message.guild.id, message.id);
        })
        .catch((err) => logger.error(err));

    new Map(cached_roles.cache).forEach((value) => {
        if (value.name.match(/USER-/i)) {
            color_roles++;
        }
    });

    const to_be_deleted = await cacheToBeDeleted.get(message.guild.id);

    message.channel.messages
        .fetch(to_be_deleted)
        .then((message) => {
            message.delete({ reason: 'Automated deletion by SmokeyBot' });
        })
        .catch((err) => logger.error(err));

    if (color_roles > 0) {
        embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There are ${color_roles} color role(s).`);
        // Send the embed to the same channel as the message
        message.channel.send({ embeds: [embed] });
    } else {
        embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There were no color roles.`);
        // Send the embed to the same channel as the message
        message.channel.send({ embeds: [embed] });
    }
}

export async function removeColorRoles(message: Message): Promise<void> {
    logger.info(
        `Checking for color roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
    );

    const cached_roles = await message.guild.roles.fetch();
    let color_roles = 0;

    let embed = new MessageEmbed()
        // Set the title of the field
        .setTitle('Role Manager')
        // Set the color of the embed
        .setColor(0xff0000)
        // Set the main content of the embed
        .setDescription(`Checking for color roles.`);
    // Send the embed to the same channel as the message
    await message.channel
        .send({ embeds: [embed] })
        .then(async (message) => {
            await cacheToBeDeleted.set(message.guild.id, message.id);
        })
        .catch((err) => logger.error(err));

    let temp_timer = 1000;

    new Map(cached_roles.cache).forEach((value) => {
        const temp_mods = [
            'USER-120041147291795458',
            'USER-106164905127731200',
            'USER-90646365092188160',
            'USER-235188818641158154',
            'USER-130033913698582529',
            'USER-251083845552701440',
            'USER-121397945047318531',
            'USER-152843239336968192',
            'USER-354374626081767446',
            'USER-132663982195605504',
            'USER-315603729313169408',
        ];

        if (value.name.match(/USER-/i) && !temp_mods.includes(value.name)) {
            setTimeout(delete_role, temp_timer, value, message);
            color_roles++;
            temp_timer = temp_timer + 1000;
        }
    });

    message.channel.messages
        .fetch(await cacheToBeDeleted.get(message.guild.id))
        .then((message) => {
            message.delete({ reason: 'Automated deletion by SmokeyBot' });
        })
        .catch((err) => logger.error(err));

    if (color_roles > 0) {
        embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`Successfully removed ${color_roles} color role(s).`);
        // Send the embed to the same channel as the message
        message.channel.send({ embeds: [embed] });
    } else {
        embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There were no color roles to remove.`);
        // Send the embed to the same channel as the message
        message.channel.send({ embeds: [embed] });
    }
}

export async function removeEmptyRoles(message: Message): Promise<void> {
    logger.info(
        `Checking for empty roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
    );

    const cached_roles = await message.guild.roles.fetch();
    let empty_roles = 0;

    let embed = new MessageEmbed()
        // Set the title of the field
        .setTitle('Role Manager')
        // Set the color of the embed
        .setColor(0xff0000)
        // Set the main content of the embed
        .setDescription(`Checking for empty roles.`);
    // Send the embed to the same channel as the message
    await message.channel
        .send({ embeds: [embed] })
        .then(async (message) => {
            await cacheToBeDeleted.set(message.guild.id, message.id);
        })
        .catch((err) => logger.error(err));

    new Map(cached_roles.cache).forEach((value) => {
        logger.debug(value.members.size);
        if (
            value.members.size == 0 &&
            value.name != '-BUFFER ZONE-' &&
            !value.name.match(/Twitch Subscriber/i)
        ) {
            empty_roles++;
        }
    });

    message.channel.messages
        .fetch(await cacheToBeDeleted.get(message.guild.id))
        .then((message) => {
            message.delete({ reason: 'Automated deletion by SmokeyBot' });
        })
        .catch((err) => logger.error(err));

    if (empty_roles > 0) {
        embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`Successfully removed ${empty_roles} empty role(s).`);
        // Send the embed to the same channel as the message
        message.channel.send({ embeds: [embed] });
    } else {
        embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There were no empty roles to remove.`);
        // Send the embed to the same channel as the message
        message.channel.send({ embeds: [embed] });
    }
}*/
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
