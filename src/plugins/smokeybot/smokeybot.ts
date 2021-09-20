import { Message, MessageEmbed, Permissions } from 'discord.js';
import {
  cacheClient,
  cacheTwitter,
  getGCD,
  GLOBAL_COOLDOWN,
} from '../../clients/cache';
import { getLogger } from '../../clients/logger';
import { twitterClient } from '../../clients/twitter';
import { getCurrentTime } from '../../utils';

const logger = getLogger('SmokeyBot');

export async function check_tweets(
  user: string,
  message: Message,
  tweet_count = 1,
): Promise<void> {
  const timestamp = getCurrentTime();

  const cache = await cacheClient.get(message.guild.id);

  const params = {
    screen_name: user,
    count: tweet_count,
  };
  const GCD = await getGCD(message.guild.id);

  if (
    message.member.permissions.has([Permissions.FLAGS.ADMINISTRATOR]) ||
    timestamp - GCD > 10
  ) {
    await GLOBAL_COOLDOWN.set(message.guild.id, getCurrentTime());

    twitterClient.get('statuses/user_timeline', params).then((tweets) => {
      if (cache.tweet) {
        if (cache.tweet.id != tweets[0].id) {
          // new tweet

          cache.tweet = tweets[0];

          send_tweet_message(tweets[0], message);
        } else {
          // same tweet, respond tho xd

          cache.tweet = tweets[0];

          send_tweet_message(tweets[0], message);
        }
      } else {
        cache.tweet = tweets[0];

        send_tweet_message(tweets[0], message);
      }
    });
  }
}

/**
 * Send a Message w/ Tweet
 * @param tweet
 * @param message
 */
async function send_tweet_message(
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
  message: Message,
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
  await message.channel
    .send({ embeds: [embed] })
    .then((message) => {
      return message;
    })
    .catch((err) => {
      logger.error(err);
    });

  //}
}

async function send_image_message(
  message: Message,
  image: string,
  color = 0x00bc8c,
  delete_after = false,
  delete_timer = 6000,
) {
  const embed = new MessageEmbed()
    // .setTitle('<:sumSmash:454911973868699648>')
    .setColor(color)
    // .setDescription()
    .setImage(image);
  await message.channel
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
}

async function delete_message(message: Message, msg_id: any) {
  message.channel.messages
    .fetch(msg_id)
    .then((message) => {
      message.delete();
    })
    .catch((err) => {
      logger.error(err);
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

export async function checkTweet(message: Message): Promise<void> {
  const twitter = await cacheTwitter.get(message.guild.id);

  check_tweets(twitter, message);
}
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

export async function checkVase(message: Message): Promise<void> {
  setTimeout(
    send_image_message,
    250,
    message,
    'https://media.discordapp.net/attachments/238772427960614912/698266752542572624/mHXydsWErf.gif',
    0x00bc8c,
    true,
    7000,
  );
}

export async function gtfo(message: Message): Promise<void> {
  setTimeout(
    send_image_message,
    250,
    message,
    'https://cdn.discordapp.com/attachments/238494640758587394/699139113605136404/VsSMgcJwSp.gif',
  );
}

export async function sumSmash(message: Message): Promise<void> {
  setTimeout(
    send_image_message,
    250,
    message,
    'https://i.imgur.com/0Ns0tYf.gif',
  );
}
