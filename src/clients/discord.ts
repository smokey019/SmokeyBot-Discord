import { Client, Message } from 'discord.js';
import { getLogger } from './logger';
import { cacheClient } from './cache';
import {
  IGuildSettings,
  IMonsterDB,
  IUserSettings,
  databaseClient,
} from './database';

const logger = getLogger('DiscordClient');
let rateLimited = false;
let do_not_cache: any[];

export const discordClient = new Client({ retryLimit: 5 });

discordClient.on('ready', () => {
  logger.debug('Ready');
});

discordClient.on('rateLimit', (error) => {
  logger.warn('Rate Limited', error);

  rateLimited = true;

  setTimeout(() => {
    logger.info('Rate limit timeout elapsed.');
    rateLimited = false;
  }, error.timeout);
});

discordClient.on('message', async (message) => {
  try {
    await parseMessage(message);
  } catch (error) {
    logger.error(error);
  }
});

/**
 * Pulls guild settings from database.
 *
 * @param guild_id
 */
async function getGuildSettings(guild_id: number | string) {
  databaseClient
    .from('guild_settings')
    .select()
    .where('guild_id', guild_id)
    .then((rows: any[]) => {
      if (rows.length > 0) {
        return rows[0];
      } else {
        return null;
      }
    })
    .catch((err: any) => {
      logger.error(err);
      throw err;
    });
}

/**
 * Inserts new GuildSettings into database.
 *
 * @param guild_id
 */
async function putGuildSettings(message: any) {
  databaseClient('guild_settings')
    .insert({
      guild_id: message.guild.id,
      smokemon_enabled: 0,
    })
    .then(() => logger(`Created new guild settings for ${message.guild.name}.`))
    .catch((err) => {
      logger.error(err);
      throw err;
    });
}

async function parseMessage(message: Message) {
  let to_be_deleted = '';
  let embed = null;
  const timestamp = Math.floor(Date.now() / 1000);

  if (!message.member || message.member.user.username == 'smokeybot') {
    return;
  }

  const cache =
    message.guild != null ? await cacheClient.get(message.guild.id) : undefined;

  if (cache == null) {
    if (!do_not_cache.includes(message.guild?.id)) {
      do_not_cache.push(message.guild?.id);

      const settings = await getGuildSettings(message.guild.id);

      if (settings == null) {
        putGuildSettings(message);
      } else {
        cacheClient.set(message.guild.id, {
          monster_spawn: {
            current_spawn: undefined,
            last_spawn: undefined,
            last_spawn_time: timestamp - 600,
            msg: message,
          },
          settings: settings,
          time: timestamp,
        });
      }
    }
  } else {
    if (cache.settings.smokemon_enabled) {
      if (timestamp - cache.time > 3) {
        if (message.content.match(/~release/i)) {
          cache.time = time();
          var success = cache_.set(message.guild.id, cache);

          var tmpMsg = message.content.split(' ');

          if (tmpMsg.length > 1) {
            if (tmpMsg[1].match(/\,/)) {
              var multi_dump = tmpMsg[1].split(',');

              if (multi_dump.length < 10) {
                multi_dump.forEach(async (element) => {
                  var to_release = await database.get(
                    'smokemon_monsters',
                    '*',
                    {
                      id: element,
                    },
                  );

                  if (
                    to_release &&
                    !to_release.released &&
                    to_release.uid == message.author.id
                  ) {
                    var released_monster = await database.update(
                      'smokemon_monsters',
                      {
                        released: 1,
                      },
                      {
                        id: element,
                      },
                    );
                  }
                });

                message
                  .reply(
                    `Attempting to release your monsters.. Good luck little guys :(`,
                  )
                  .then(() => {
                    console.log(
                      `${message.author.username} Attempting to release your monsters.. Good luck little guys :(`,
                    );
                    return;
                  })
                  .catch(console.error);
              }
            } else {
              var to_release = await database.get('smokemon_monsters', '*', {
                id: tmpMsg[1],
              });

              if (
                to_release &&
                !to_release.released &&
                to_release.uid == message.author.id
              ) {
                var released_monster = await database.update(
                  'smokemon_monsters',
                  {
                    released: 1,
                  },
                  {
                    id: tmpMsg[1],
                  },
                );

                if (released_monster) {
                  message
                    .reply(
                      `Successfully released your monster. Goodbye ${
                        allMonsters[to_release.monster_id - 1].name.english
                      } :(`,
                    )
                    .then(() => {
                      console.log(
                        `${message.author.username} Successfully released your monster. :(`,
                      );
                      return;
                    })
                    .catch(console.error);
                }
              }
            }
          } else {
            message
              .reply(`not enough things in ur msg there m8`)
              .then(() => {
                console.log(
                  `${message.author.username} not enough things in ur msg there m8`,
                );
                return;
              })
              .catch(console.error);
          }

          /*var userPokemon = await database.select('smokemon_monsters', '*', {
            uid: message.author.id,
            ORDER: { id: "DESC" }
          });*/
        }

        if (message.content.toLowerCase() == '~pokemon') {
          cache.time = time();
          var success = cache_.set(message.guild.id, cache);

          var userPokemon = await database.select('smokemon_monsters', '*', {
            uid: message.author.id,
            released: 0,
            ORDER: { id: 'DESC' },
          });

          if (userPokemon) {
            var tmpallMonsters = getMonsters;
            var message_contents = [];

            message_contents.push(`**Total Pokémon**: ${userPokemon.length}\n`);

            userPokemon.forEach((element) => {
              if (element.shiny) {
                var shiny = ' <:star:719087649536606208>';
              } else {
                var shiny = '';
              }

              var iv_avg =
                ((element.hp +
                  element.attack +
                  element.defense +
                  element.sp_attack +
                  element.sp_defense +
                  element.speed) /
                  186) *
                100;

              message_contents.push(
                `**${element.id}** - **${
                  tmpallMonsters[element.monster_id - 1].name.english
                }${shiny}** - **Level ${
                  element.level
                }** - **Avg IV ${iv_avg.toFixed(2)}%**`,
              );
            });

            if (message_contents.length > 30) {
              message_contents = message_contents.slice(0, 31);
            }

            var new_msg = message_contents.join('\n');

            embed = new MessageEmbed()
              .setAuthor(
                `${message.author.username}'s Pokémon`,
                message.author.avatarURL(),
              )
              //.setTitle(`${message.author.username}'s Pokémon`)
              .setColor(0xff0000)
              .setDescription(new_msg);
            await message.channel
              .send(embed)
              .then((message) => {
                //nothing rn
              })
              .catch(console.error);
          } else {
            message
              .reply(`You don't have any monsters in your Pokédex. :(`)
              .then(() => {
                console.log(
                  `${message.author.username} doesn't have any Pokémon!`,
                );
                return;
              })
              .catch(console.error);
          }
        }

        if (
          message.content.match(/~info/i) &&
          message.content.toLowerCase() != '~info latest'
        ) {
          var tmpSplit = message.content.split(' ');

          if (tmpSplit.length == 2) {
            var tmpMonster = await database.get('smokemon_monsters', '*', {
              id: tmpSplit[1],
            });

            if (!tmpMonster) return;

            var tmpMonsters = getMonsters;

            var monster = tmpMonsters[tmpMonster.monster_id - 1];

            var monster_types = monster.type.join(' | ');

            if (monster.id.toString().length == 1) {
              var tmpID = '00' + monster.id;
            } else if (monster.id.toString().length == 2) {
              var tmpID = '0' + monster.id;
            } else if (monster.id.toString().length == 3) {
              var tmpID = monster.id;
            }

            try {
              var monster_nature = JSON.parse(tmpMonster.nature);
            } catch (error) {
              var monster_nature = {
                type: 'Rash',
                increases: 'Sp. Atk',
                decreases: 'Sp. Def',
              };
            }

            var monster_stats = {
              hp: Math.round(
                2 * monster.base.HP +
                  (tmpMonster.hp * tmpMonster.level) / 100 +
                  tmpMonster.level +
                  10,
              ),
              attack: Math.round(
                2 * monster.base.Attack +
                  (tmpMonster.attack * tmpMonster.level) / 100 +
                  5,
              ),
              defense: Math.round(
                2 * monster.base.Defense +
                  (tmpMonster.defense * tmpMonster.level) / 100 +
                  5,
              ),
              sp_attack: Math.round(
                2 * monster.base['Sp. Attack'] +
                  (tmpMonster.sp_attack * tmpMonster.level) / 100 +
                  5,
              ),
              sp_defense: Math.round(
                2 * monster.base['Sp. Defense'] +
                  (tmpMonster.sp_defense * tmpMonster.level) / 100 +
                  5,
              ),
              speed: Math.round(
                2 * monster.base.Speed +
                  (tmpMonster.speed * tmpMonster.level) / 100 +
                  5,
              ),
            };

            var iv_avg =
              ((tmpMonster.hp +
                tmpMonster.attack +
                tmpMonster.defense +
                tmpMonster.sp_attack +
                tmpMonster.sp_defense +
                tmpMonster.speed) /
                186) *
              100;

            if (tmpMonster.shiny) {
              embed = new MessageEmbed()
                .setTitle(
                  `**Level ${tmpMonster.level} ${monster.name.english} <:star:719087649536606208>**`,
                )
                .setColor(0xff0000)
                .setImage(
                  `https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`,
                )
                // .setImage(`https://www.serebii.net/Shiny/SWSH/${tmpID}.png`)
                // .setImage(`https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`)
                .setThumbnail(
                  `https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`,
                )
                .setDescription(`<:star:719087649536606208> **SHINY** <:star:719087649536606208>\n
              **ID**: ${tmpMonster.id}
              **Exp**: ${formatNumber(tmpMonster.experience)}
              **Type**: ${monster_types}
              **Nature**: ${monster_nature.type}
              **HP**: ${monster_stats.hp} - IV: ${tmpMonster.hp}/31
              **Attack**: ${monster_stats.attack} - IV: ${tmpMonster.attack}/31
              **Defense**: ${monster_stats.defense} - IV: ${
                tmpMonster.defense
              }/31
              **Sp. Atk**: ${monster_stats.sp_attack} - IV: ${
                tmpMonster.sp_attack
              }/31
              **Sp. Def**: ${monster_stats.sp_defense} - IV: ${
                tmpMonster.sp_defense
              }/31
              **Speed**: ${monster_stats.speed} - IV: ${tmpMonster.speed}/31\n
              **Total IV %**: ${iv_avg.toFixed(2)}%`);
              await message.channel
                .send(embed)
                .then((message) => {
                  return;
                })
                .catch(console.error);
            } else {
              embed = new MessageEmbed() // .setThumbnail(`https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`)
                .setTitle(
                  `**Level ${tmpMonster.level} ${monster.name.english}**`,
                )
                .setColor(0xff0000)
                .setThumbnail(
                  `https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`,
                )
                .setImage(
                  `https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`,
                ).setDescription(`**ID**: ${tmpMonster.id}
              **Exp**: ${formatNumber(tmpMonster.experience)}
              **Type**: ${monster_types}
              **Nature**: ${monster_nature.type}
              **HP**: ${monster_stats.hp} - IV: ${tmpMonster.hp}/31
              **Attack**: ${monster_stats.attack} - IV: ${tmpMonster.attack}/31
              **Defense**: ${monster_stats.defense} - IV: ${
                tmpMonster.defense
              }/31
              **Sp. Atk**: ${monster_stats.sp_attack} - IV: ${
                tmpMonster.sp_attack
              }/31
              **Sp. Def**: ${monster_stats.sp_defense} - IV: ${
                tmpMonster.sp_defense
              }/31
              **Speed**: ${monster_stats.speed} - IV: ${tmpMonster.speed}/31\n
              **Total IV %**: ${iv_avg.toFixed(2)}%`);
              await message.channel
                .send(embed)
                .then((message) => {
                  return;
                })
                .catch(console.error);
            }
          }
        }

        if (message.content.toLowerCase() == '~info latest') {
          cache.time = time();
          var success = cache_.set(message.guild.id, cache);

          var user = await database.get('smokemon_users', '*', {
            uid: message.author.id,
          });

          if (user) {
            if (user.latest_monster) {
              var tmpMonster = await database.get('smokemon_monsters', '*', {
                id: user.latest_monster,
              });

              if (!tmpMonster) return;

              var tmpMonsters = getMonsters;

              var monster = tmpMonsters[tmpMonster.monster_id - 1];

              var monster_types = monster.type.join(' | ');

              if (monster.id.toString().length == 1) {
                var tmpID = '00' + monster.id;
              } else if (monster.id.toString().length == 2) {
                var tmpID = '0' + monster.id;
              } else if (monster.id.toString().length == 3) {
                var tmpID = monster.id;
              }

              try {
                var monster_nature = JSON.parse(tmpMonster.nature);
              } catch (error) {
                var monster_nature = {
                  type: 'Rash',
                  increases: 'Sp. Atk',
                  decreases: 'Sp. Def',
                };
              }

              var monster_stats = {
                hp: Math.round(
                  2 * monster.base.HP +
                    (tmpMonster.hp * tmpMonster.level) / 100 +
                    tmpMonster.level +
                    10,
                ),
                attack: Math.round(
                  2 * monster.base.Attack +
                    (tmpMonster.attack * tmpMonster.level) / 100 +
                    5,
                ),
                defense: Math.round(
                  2 * monster.base.Defense +
                    (tmpMonster.defense * tmpMonster.level) / 100 +
                    5,
                ),
                sp_attack: Math.round(
                  2 * monster.base['Sp. Attack'] +
                    (tmpMonster.sp_attack * tmpMonster.level) / 100 +
                    5,
                ),
                sp_defense: Math.round(
                  2 * monster.base['Sp. Defense'] +
                    (tmpMonster.sp_defense * tmpMonster.level) / 100 +
                    5,
                ),
                speed: Math.round(
                  2 * monster.base.Speed +
                    (tmpMonster.speed * tmpMonster.level) / 100 +
                    5,
                ),
              };

              var iv_avg =
                ((tmpMonster.hp +
                  tmpMonster.attack +
                  tmpMonster.defense +
                  tmpMonster.sp_attack +
                  tmpMonster.sp_defense +
                  tmpMonster.speed) /
                  186) *
                100;

              if (tmpMonster.shiny) {
                embed = new MessageEmbed() // .setThumbnail(`https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`)
                  .setAuthor(
                    `${message.author.username}'s latest Pokémon`,
                    message.author.avatarURL(),
                  )
                  //.setTitle(`${message.author.username}'s latest Pokémon`)
                  .setColor(0xff0000)
                  .setThumbnail(
                    `https://bot.smokey.gg/pokemon/images/gif/${tmpID}_shiny.gif`,
                  )
                  // .setImage(`https://www.serebii.net/Shiny/SWSH/${tmpID}.png`)
                  .setImage(
                    `https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`,
                  ).setDescription(`**Level ${tmpMonster.level} ${
                  monster.name.english
                } <:star:719087649536606208>**\n
                <:star:719087649536606208> **SHINY** <:star:719087649536606208>\n
                **ID**: ${tmpMonster.id}
                **Exp**: ${formatNumber(tmpMonster.experience)}
                **Type**: ${monster_types}
                **Nature**: ${monster_nature.type}
                **HP**: ${monster_stats.hp} - IV: ${tmpMonster.hp}/31
                **Attack**: ${monster_stats.attack} - IV: ${
                  tmpMonster.attack
                }/31
                **Defense**: ${monster_stats.defense} - IV: ${
                  tmpMonster.defense
                }/31
                **Sp. Atk**: ${monster_stats.sp_attack} - IV: ${
                  tmpMonster.sp_attack
                }/31
                **Sp. Def**: ${monster_stats.sp_defense} - IV: ${
                  tmpMonster.sp_defense
                }/31
                **Speed**: ${monster_stats.speed} - IV: ${tmpMonster.speed}/31\n
                **Total IV %**: ${iv_avg.toFixed(2)}%`);
                await message.channel
                  .send(embed)
                  .then((message) => {
                    return;
                  })
                  .catch(console.error);
              } else {
                embed = new MessageEmbed() // .setThumbnail(`https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`)
                  .setAuthor(
                    `${message.author.username}'s latest Pokémon`,
                    message.author.avatarURL(),
                  )
                  //.setTitle(`${message.author.username}'s latest Pokémon`)
                  .setColor(0xff0000)
                  .setThumbnail(
                    `https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`,
                  )
                  .setImage(
                    `https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`,
                  ).setDescription(`**Level ${tmpMonster.level} ${
                  monster.name.english
                }**\n
                **ID**: ${tmpMonster.id}
                **Exp**: ${formatNumber(tmpMonster.experience)}
                **Type**: ${monster_types}
                **Nature**: ${monster_nature.type}
                **HP**: ${monster_stats.hp} - IV: ${tmpMonster.hp}/31
                **Attack**: ${monster_stats.attack} - IV: ${
                  tmpMonster.attack
                }/31
                **Defense**: ${monster_stats.defense} - IV: ${
                  tmpMonster.defense
                }/31
                **Sp. Atk**: ${monster_stats.sp_attack} - IV: ${
                  tmpMonster.sp_attack
                }/31
                **Sp. Def**: ${monster_stats.sp_defense} - IV: ${
                  tmpMonster.sp_defense
                }/31
                **Speed**: ${monster_stats.speed} - IV: ${tmpMonster.speed}/31\n
                **Total IV %**: ${iv_avg.toFixed(2)}%`);
                await message.channel
                  .send(embed)
                  .then((message) => {
                    return;
                  })
                  .catch(console.error);
              }
            }
          } else {
            console.log(`there was an error getting user's db info `);
            return;
          }
        }
      } else if (timestamp - cache.time < 3) {
        if (
          message.content.match(/~release/i) ||
          message.content.match(/~pokemon/i) ||
          message.content.match(/~info/i)
        ) {
          console.log('cooldown present');
          return;
        }
      }

      var spawn_timer = getRndInteger(30, 600);

      if (timestamp - cache.monster_spawn.last_spawn_time > spawn_timer) {
        spawnMonster(message, cache);
      }

      if (cache.monster_spawn.current_spawn) {
        catchMonster(message, cache);
      }
    }

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

        let existing_emojis = [];

        let synced_emotes = 0;

        let split_msg = message.content.split(' ');

        if (split_msg.length != 2) {
          return;
        }

        let emojis = { FFZ: {} };

        split_msg[1] = split_msg[1].toLowerCase().replace(/\W/g, '');

        console.log(
          `fetching FFZ Emotes for Twitch channel ${split_msg[1]} (requested by ${message.member.displayName} in ${message.guild.name})..`,
        );

        // emojis.smokEmotes = await json_fetch(`https://bot.smokey.gg/api/emotes/?channel_id=${split_msg[1]}`);

        let ffz_emotes = await json_fetch(
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
          let set_number = ffz_emotes.room.set;
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

        let existing_emojis = [];

        let synced_emotes = 0;

        let split_msg = message.content.split(' ');

        if (split_msg.length < 2) {
          return;
        }

        let emojis = { smokEmotes: {} };

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
            .setDescription(
              `There was an error fetching from smokEmotes's API.`,
            );
          // Send the embed to the same channel as the message
          message.channel.send(embed);

          return;
        } else {
          new Map(message.guild.emojis.cache).forEach((value) => {
            existing_emojis.push(value.code);
          });

          var emote_cooldown = 1000;

          emojis.smokEmotes.forEach((value) => {
            let emote_url = value.images['2x'];

            if (!existing_emojis.includes(value.code) && value.width <= 128) {
              setTimeout(
                create_emoji,
                emote_cooldown,
                emote_url,
                message,
                value,
              );

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
          cache.time = time();

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
            cache.time = time();
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
            cache.time = time();
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

          let cached_roles = await message.guild.roles.fetch();
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

          let cached_roles = await message.guild.roles.fetch();
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
            let temp_mods = [
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

          let cached_roles = await message.guild.roles.fetch();
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
            cache.time = time();
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
            cache.time = time();
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
            cache.time = time();
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
}
