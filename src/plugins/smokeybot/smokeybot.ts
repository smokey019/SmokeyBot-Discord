/**
 * @notes TODO: smokeybot stuff :)
 */
export function placeholder() {
  if (message.content.match(/~sync-emotes-ffz/i) && rate_limited == false) {
    if (message.member.hasPermission('ADMINISTRATOR')) {
      embed = new MessageEmbed()
        // Set the title of the field
        .setTitle('Emoji Manager')
        // Set the color of the embed
        .setColor(0xff0000)
        // Set the main content of the embed
        .setDescription(`Checking FrankerFaceZ API to sync emotes..`);
      // Send the embed to the same channel as the message
      await message.channel
        .send(embed)
        .then((message) => {
          to_be_deleted = message.id;
        })
        .catch(console.error);

      const existing_emojis = [];

      const synced_emotes = 0;

      const split_msg = message.content.split(' ');

      if (split_msg.length != 2) {
        return;
      }

      const emojis = { FFZ: {} };

      split_msg[1] = split_msg[1].toLowerCase().replace(/\W/g, '');

      console.log(
        `fetching FFZ Emotes for Twitch channel ${split_msg[1]} (requested by ${message.member.displayName} in ${message.guild.name})..`,
      );

      // emojis.smokEmotes = await json_fetch(`https://bot.smokey.gg/api/emotes/?channel_id=${split_msg[1]}`);

      const ffz_emotes = await json_fetch(
        `https://api.frankerfacez.com/v1/room/${split_msg[1]}`,
      );

      if (!ffz_emotes) {
        message.channel.messages
          .fetch(to_be_deleted)
          .then((message) => {
            message.delete(message);
          })
          .catch(console.error);

        embed = new MessageEmbed()
          // Set the title of the field
          .setTitle('Emoji Manager')
          // Set the color of the embed
          .setColor(0xff0000)
          // Set the main content of the embed
          .setDescription(
            `There was an error fetching from FrankerFaceZ's API.`,
          );
        // Send the embed to the same channel as the message
        message.channel.send(embed);

        return;
      }

      if (ffz_emotes.room.set) {
        const set_number = ffz_emotes.room.set;
        var emote_cooldown = 1000;

        emojis.FFZ = ffz_emotes.sets[set_number].emoticons;

        new Map(message.guild.emojis.cache).forEach((value) => {
          existing_emojis.push(value.name);
        });

        emojis.FFZ.forEach((value) => {
          let emote_url = '';

          if (value.urls['2']) {
            emote_url = 'https:' + value.urls['2'];
          } else {
            emote_url = 'https:' + value.urls['4'];
          }

          if (emote_url.match(/frankerfacez/i)) {
            if (!existing_emojis.includes(value.name)) {
              setTimeout(
                create_emoji,
                emote_cooldown,
                emote_url,
                message,
                value,
              );

              emote_cooldown = emote_cooldown + 1250;

              /*message.guild.emojis.create(emote_url, value.name)
							  .then(emoji => {
								console.log(`Created new emoji with name ${emoji.name}!`);
								synced_emotes++;
							  })
							  .catch(console.error);*/
            }
          }
        });
      }

      if (ffz_emotes) {
        message.channel.messages
          .fetch(to_be_deleted)
          .then((message) => {
            message.delete(message);
          })
          .catch(console.error);

        embed = new MessageEmbed()
          // Set the title of the field
          .setTitle('Emoji Manager')
          // Set the color of the embed
          .setColor(0x00bc8c)
          // Set the main content of the embed
          .setDescription(
            `**Successfully synced emotes!** \n\n It may take a minute or two for all of emojis to show up. \n\n **NOTE:** Wide emotes won't show up properly in Discord.`,
          );
        // Send the embed to the same channel as the message
        message.channel.send(embed);
      }

      /*console.log(existing_emojis);

			console.log(emojis);*/
    }
  }

  if (
    message.content.match(/~sync-emotes-smokemotes/i) &&
    rate_limited == false
  ) {
    if (message.member.hasPermission('ADMINISTRATOR')) {
      embed = new MessageEmbed()
        // Set the title of the field
        .setTitle('Emoji Manager')
        // Set the color of the embed
        .setColor(0xff0000)
        // Set the main content of the embed
        .setDescription(`Checking smokEmotes API to sync emotes..`);
      // Send the embed to the same channel as the message
      await message.channel
        .send(embed)
        .then((message) => {
          to_be_deleted = message.id;
        })
        .catch(console.error);

      const existing_emojis = [];

      const synced_emotes = 0;

      const split_msg = message.content.split(' ');

      if (split_msg.length < 2) {
        return;
      }

      const emojis = { smokEmotes: {} };

      split_msg[1] = split_msg[1].toLowerCase().replace(/\W/g, '');

      split_msg[2] = split_msg[2].toLowerCase();

      if (split_msg[1] == 'global' && split_msg[2] == 'static') {
        console.log(
          `fetching Global Static smokEmotes (requested by ${message.member.displayName} in ${message.guild.name})..`,
        );

        emojis.smokEmotes = await json_fetch(
          `https://bot.smokey.gg/api/emotes/?channel_name=global&type=static`,
        );
      } else if (split_msg[1] == 'global' && split_msg[2] == 'gif') {
        console.log(
          `fetching Global Static smokEmotes (requested by ${message.member.displayName} in ${message.guild.name})..`,
        );

        emojis.smokEmotes = await json_fetch(
          `https://bot.smokey.gg/api/emotes/?channel_name=global&type=gif`,
        );
      }

      if (!emojis.smokEmotes) {
        message.channel.messages
          .fetch(to_be_deleted)
          .then((message) => {
            message.delete(message);
          })
          .catch(console.error);

        embed = new MessageEmbed()
          // Set the title of the field
          .setTitle('Emoji Manager')
          // Set the color of the embed
          .setColor(0xff0000)
          // Set the main content of the embed
          .setDescription(`There was an error fetching from smokEmotes's API.`);
        // Send the embed to the same channel as the message
        message.channel.send(embed);

        return;
      } else {
        new Map(message.guild.emojis.cache).forEach((value) => {
          existing_emojis.push(value.code);
        });

        var emote_cooldown = 1000;

        emojis.smokEmotes.forEach((value) => {
          const emote_url = value.images['2x'];

          if (!existing_emojis.includes(value.code) && value.width <= 128) {
            setTimeout(create_emoji, emote_cooldown, emote_url, message, value);

            emote_cooldown = emote_cooldown + 1250;
          }
        });

        if (emojis.smokEmotes) {
          message.channel.messages
            .fetch(to_be_deleted)
            .then((message) => {
              message.delete(message);
            })
            .catch(console.error);

          embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Emoji Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(
              `**Successfully synced emotes!** \n\n It may take a minute or two for all of emojis to show up. \n\n **NOTE:** Wide emotes won't show up properly in Discord and are not uploaded.`,
            );
          // Send the embed to the same channel as the message
          message.channel.send(embed);
        }
      }
    }
  }

  switch (message.content) {
    case '~test':
      if (
        message.member.hasPermission('ADMINISTRATOR') ||
        timestamp - cache.time > 10
      ) {
        getRandomItem();
        getRandomMonster();
      }

      break;

    case '`~smokemon enable':
      if (message.member.hasPermission('ADMINISTRATOR')) {
        cache.time = timestamp;

        cache.settings.smokemon_enabled = true;

        var success = cache_.set(message.guild.id, cache);

        var tmp = await database.update(
          'guild_settings',
          {
            smokemon_enabled: 1,
          },
          {
            guild_id: message.guild.id,
          },
        );

        if (!tmp) {
          tmp = await database.insert('guild_settings', {
            smokemon_enabled: 1,
            guild_id: message.guild.id,
          });

          if (tmp) {
            send_message(
              'Success!',
              'Successfully enabled SmokeMon! Please note this plugin is for fun and SmokeyBot does not own the rights to any images/data and images/data are copyrighted by the Pokémon Company and its affiliates.',
              message,
              0x00bc8c,
            );
          }
        } else {
          send_message(
            'Success!',
            'Successfully enabled SmokeMon! Please note this plugin is for fun and SmokeyBot does not own the rights to any images/data and images/data are copyrighted by the Pokémon Company and its affiliates.',
            message,
            0x00bc8c,
          );
        }
      }

      break;

    case '~invite':
      if (
        message.member.hasPermission('ADMINISTRATOR') ||
        timestamp - cache.time > 10
      ) {
        if (!message.member.hasPermission('ADMINISTRATOR')) {
          cache.time = timestamp;
          var success = cache_.set(message.guild.id, cache);
        }

        message.reply(
          "here is Smokey's Discord Bot invite link: https://discordapp.com/oauth2/authorize?client_id=458710213122457600&scope=bot&permissions=8",
        );
      }

      break;

    case '~check twitter':
    case '~check tweet':
      if (
        message.member.hasPermission('ADMINISTRATOR') ||
        timestamp - cache.time > 10
      ) {
        if (!message.member.hasPermission('ADMINISTRATOR')) {
          cache.time = timestamp;
          var success = cache_.set(message.guild.id, cache);
        }

        check_tweets(cache.twitter, message);
      }

      break;

    case '~check color roles':
      if (
        message.member.hasPermission('ADMINISTRATOR') &&
        rate_limited == false
      ) {
        console.log(
          `Checking for color roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
        );

        const cached_roles = await message.guild.roles.fetch();
        let color_roles = 0;

        embed = new MessageEmbed()
          // Set the title of the field
          .setTitle('Role Manager')
          // Set the color of the embed
          .setColor(0xff0000)
          // Set the main content of the embed
          .setDescription(`Checking for color roles.`);
        // Send the embed to the same channel as the message
        await message.channel
          .send(embed)
          .then((message) => {
            to_be_deleted = message.id;
          })
          .catch((err) => console.log(err));

        new Map(cached_roles.cache).forEach((value) => {
          if (value.name.match(/USER-/i)) {
            color_roles++;
          }
        });

        message.channel.messages
          .fetch(to_be_deleted)
          .then((message) => {
            message.delete(message);
          })
          .catch((err) => console.log(err));

        if (color_roles > 0) {
          embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There are ${color_roles} color role(s).`);
          // Send the embed to the same channel as the message
          message.channel.send(embed);
        } else {
          embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There were no color roles.`);
          // Send the embed to the same channel as the message
          message.channel.send(embed);
        }

        console.log(
          `Finished checking for color roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
        );
      }

      break;

    case '~remove color roles':
      if (
        message.member.hasPermission('ADMINISTRATOR') &&
        rate_limited == false
      ) {
        console.log(
          `Checking for color roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
        );

        const cached_roles = await message.guild.roles.fetch();
        let color_roles = 0;

        embed = new MessageEmbed()
          // Set the title of the field
          .setTitle('Role Manager')
          // Set the color of the embed
          .setColor(0xff0000)
          // Set the main content of the embed
          .setDescription(`Checking for color roles.`);
        // Send the embed to the same channel as the message
        await message.channel
          .send(embed)
          .then((message) => {
            to_be_deleted = message.id;
          })
          .catch((err) => console.log(err));

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
          .fetch(to_be_deleted)
          .then((message) => {
            message.delete(message);
          })
          .catch((err) => console.log(err));

        if (color_roles > 0) {
          embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(
              `Successfully removed ${color_roles} color role(s).`,
            );
          // Send the embed to the same channel as the message
          message.channel.send(embed);
        } else {
          embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There were no color roles to remove.`);
          // Send the embed to the same channel as the message
          message.channel.send(embed);
        }

        console.log(
          `Finished checking for color roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
        );
      }

      break;

    case '~remove empty roles':
      if (
        message.member.hasPermission('ADMINISTRATOR') &&
        rate_limited == false
      ) {
        console.log(
          `Checking for empty roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
        );

        const cached_roles = await message.guild.roles.fetch();
        let empty_roles = 0;

        embed = new MessageEmbed()
          // Set the title of the field
          .setTitle('Role Manager')
          // Set the color of the embed
          .setColor(0xff0000)
          // Set the main content of the embed
          .setDescription(`Checking for empty roles.`);
        // Send the embed to the same channel as the message
        await message.channel
          .send(embed)
          .then((message) => {
            to_be_deleted = message.id;
          })
          .catch((err) => console.log(err));

        new Map(cached_roles.cache).forEach((value) => {
          console.log(value.name, value.members.size);

          if (
            value.members.size == 0 &&
            value.name != '-BUFFER ZONE-' &&
            !value.name.match(/Twitch Subscriber/i)
          ) {
            console.log(`role '${value.name}' has 0 members.`);

            value
              .delete(
                `Empty role. Deleted by SmokeyBot - initiated by ${message.author}.`,
              )
              .then((deleted) => console.log(`Deleted role ${deleted.name}`))
              .catch((err) => console.log(err));
            empty_roles++;
          }
        });

        message.channel.messages
          .fetch(to_be_deleted)
          .then((message) => {
            message.delete(message);
          })
          .catch((err) => console.log(err));

        if (empty_roles > 0) {
          embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(
              `Successfully removed ${empty_roles} empty role(s).`,
            );
          // Send the embed to the same channel as the message
          message.channel.send(embed);
        } else {
          embed = new MessageEmbed()
            // Set the title of the field
            .setTitle('Role Manager')
            // Set the color of the embed
            .setColor(0x00bc8c)
            // Set the main content of the embed
            .setDescription(`There were no empty roles to remove.`);
          // Send the embed to the same channel as the message
          message.channel.send(embed);
        }

        console.log(
          `Finished checking for empty roles -> requested by ${message.member.displayName} in ${message.guild.name}..`,
        );
      }

      break;

    case '~check vase':
      if (
        message.member.hasPermission('ADMINISTRATOR') ||
        timestamp - cache.time > 10
      ) {
        if (!message.member.hasPermission('ADMINISTRATOR')) {
          cache.time = timestamp;
          var success = cache_.set(message.guild.id, cache);
        }

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

      break;

    case '~gtfo':
      if (
        message.member.hasPermission('ADMINISTRATOR') ||
        timestamp - cache.time > 10
      ) {
        if (!message.member.hasPermission('ADMINISTRATOR')) {
          cache.time = timestamp;
          var success = cache_.set(message.guild.id, cache);
        }

        setTimeout(
          send_image_message,
          250,
          message,
          'https://cdn.discordapp.com/attachments/238494640758587394/699139113605136404/VsSMgcJwSp.gif',
        );
      }

      break;

    case '~smash':
      if (
        message.member.hasPermission('ADMINISTRATOR') ||
        timestamp - cache.time > 10
      ) {
        if (!message.member.hasPermission('ADMINISTRATOR')) {
          cache.time = timestamp;
          var success = cache_.set(message.guild.id, cache);
        }

        setTimeout(
          send_image_message,
          250,
          message,
          'https://i.imgur.com/0Ns0tYf.gif',
        );
      }

      break;

    default:
      break;
  }
}
