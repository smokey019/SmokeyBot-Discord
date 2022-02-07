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
exports.sumSmash = exports.gtfo = exports.checkVase = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../clients/logger");
const logger = (0, logger_1.getLogger)('SmokeyBot');
/*export async function check_tweets(
  user: string,
  interaction: CommandInteraction,
  tweet_count = 1,
): Promise<void> {
  const timestamp = getCurrentTime();

  const cache = await cacheClient.get(interaction.guild.id);

  const params = {
    screen_name: user,
    count: tweet_count,
  };
  const GCD = await getGCD(interaction.guild.id);

  if (
    interaction.member.permissions.has([Permissions.FLAGS.ADMINISTRATOR]) ||
    timestamp - GCD > 10
  ) {
    GLOBAL_COOLDOWN.set(interaction.guild.id, getCurrentTime());

    twitterClient.get('statuses/user_timeline', params).then((tweets) => {
      if (cache.tweet) {
        if (cache.tweet.id != tweets[0].id) {
          // new tweet

          cache.tweet = tweets[0];

          send_tweet_message(tweets[0], interaction);
        } else {
          // same tweet, respond tho xd

          cache.tweet = tweets[0];

          send_tweet_message(tweets[0], interaction);
        }
      } else {
        cache.tweet = tweets[0];

        send_tweet_message(tweets[0], interaction);
      }
    });
  }
}*/
/**
 * Send a Message w/ Tweet
 * @param tweet
 * @param message
 */
/*async function send_tweet_message(
  tweet: {
    user: {
      profile_background_color: string;
      name: string;
      profile_image_url_https: string;
    };
    text: string;
    id_str: string;
    created_at: number | Date;
  },
  interaction: CommandInteraction,
): Promise<void> {
  //if (tweet.text.charAt(0) != "@") {

  const embed = new MessageEmbed()
    .setTitle(`*Latest Tweet*`)
    .setColor('BLUE')
    .setDescription(
      tweet.text +
        `\n\n *https://twitter.com/${tweet.user.name}/status/${tweet.id_str}*`,
    )
    .setAuthor(
      tweet.user.name,
      tweet.user.profile_image_url_https,
      `https://twitter.com/${tweet.user.name}`,
    )
    .setTimestamp(tweet.created_at)
    .setFooter(
      'Twitter',
      'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
    );
  // .setURL(`https://twitter.com/${tweet.user.name}/status/${tweet.id_str}`);
  await interaction.channel
    .send({ embeds: [embed] })
    .then((interaction) => {
      return message;
    })
    .catch((err) => {
      logger.error(err);
    });

  //}
}*/
function send_image_message(interaction, image, color = 0x00bc8c, delete_after = false, delete_timer = 6000) {
    return __awaiter(this, void 0, void 0, function* () {
        const embed = new discord_js_1.MessageEmbed()
            // .setTitle('<:sumSmash:454911973868699648>')
            .setColor(color)
            // .setDescription()
            .setImage(image);
        yield interaction.channel
            .send({ embeds: [embed] })
            .then((tmpMsg) => {
            if (delete_after && delete_timer > 1000) {
                setTimeout(delete_message, delete_timer, interaction, tmpMsg.id);
                setTimeout(delete_message, delete_timer, interaction, interaction.id);
            }
        })
            .catch((err) => {
            logger.error(err);
        });
    });
}
function delete_message(interaction, msg_id) {
    return __awaiter(this, void 0, void 0, function* () {
        interaction.channel.messages
            .fetch(msg_id)
            .then((interaction) => {
            interaction.delete();
        })
            .catch((err) => {
            logger.error(err);
        });
    });
}
function checkVase(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        setTimeout(send_image_message, 250, interaction, 'https://media.discordapp.net/attachments/238772427960614912/698266752542572624/mHXydsWErf.gif', 0x00bc8c, true, 7000);
    });
}
exports.checkVase = checkVase;
function gtfo(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        setTimeout(send_image_message, 250, interaction, 'https://cdn.discordapp.com/attachments/238494640758587394/699139113605136404/VsSMgcJwSp.gif');
    });
}
exports.gtfo = gtfo;
function sumSmash(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        setTimeout(send_image_message, 250, interaction, 'https://i.imgur.com/0Ns0tYf.gif');
    });
}
exports.sumSmash = sumSmash;
