import { getLogger } from '../../clients/logger';
import { Message, MessageEmbed } from 'discord.js';
import { getMonsterUser, databaseClient } from '../../clients/database';
import { ITrade, TradeTable } from '../../models/Trades';
import { getCurrentTime, theWord } from '../../utils';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import {
  findMonsterByID,
  IMonsterDex,
  findMonsterByName,
  getUserMonster,
} from './monsters';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';

const logger = getLogger('Pokemon-Trade');

export async function startTrade(message: Message): Promise<any> {
  // ~trade start @mention id-for-monster
  const split = message.content.split(' ');
  const traded_monster = parseInt(split[3]);
  const mentions = message.mentions.users;

  if (mentions.first()) {
    const to_user = mentions.first().id;

    if (to_user == message.author.id) return;

    const recipient = await getMonsterUser(to_user);
    const check_trade = await checkTrade(traded_monster, to_user, message);

    if (recipient && !check_trade) {
      const insertTrade = await databaseClient<ITrade>(TradeTable).insert({
        monster_id: traded_monster,
        uid_from: message.author.id,
        uid_to: to_user,
        active: 1,
        traded: 0,
        timestamp: getCurrentTime(),
      });

      if (insertTrade) {
        message.reply(
          `initiated trade with <@${to_user}> - if they want to accept the trade type ~trade accept!`,
        );
      } else {
        logger.error(`DB error while inserting trade.`);
      }
    } else if (!recipient) {
      message.reply(
        `could not find user <@${to_user}>, make them catch a ${theWord()} first!`,
      );
    } else if (check_trade) {
      message.reply(
        `a trade with this ${theWord()} or user exists already. Close that one and try again.`,
      );
    }
  } else {
    message.reply(`you need to mention someone m8.`);
  }
}

export async function parseTrade(message: Message): Promise<any> {
  // ~trade start @mention id-for-monster

  const split = message.content.split(' ');

  if (split[1] == 'start') {
    await startTrade(message);
  } else if (
    split[1] == 'cancel' ||
    split[1] == 'delete' ||
    split[1] == 'del' ||
    split[1] == '-'
  ) {
    await cancelTrade(message);
  } else if (
    split[1] == 'accept' ||
    split[1] == 'confirm' ||
    split[1] == 'acc' ||
    split[1] == '+'
  ) {
    await confirmTrade(message);
  }
}

export async function checkEvolves(
  monster_id: number,
  message: Message,
): Promise<any> {
  const db_monster = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      id: monster_id,
    });

  if (db_monster.length) {
    const monster: IMonsterDex = findMonsterByID(db_monster[0].monster_id);

    if (monster.evos && db_monster[0].held_item != 229) {
      const evolution: IMonsterDex = findMonsterByName(monster.evos[0]);

      if (evolution) {
        if (evolution.evoType) {
          if (evolution.evoType == 'trade') {
            const updateMonster = await databaseClient<IMonsterModel>(
              MonsterTable,
            )
              .where({ id: db_monster[0].id })
              .update({ monster_id: evolution.id });

            if (updateMonster) {
              let imgs = [];
              if (db_monster[0].shiny) {
                imgs = [evolution.images.shiny, monster.images.shiny];
              } else {
                imgs = [evolution.images.normal, monster.images.normal];
              }
              const embed = new MessageEmbed({
                color: 0x00bc8c,
                description: `Nice! **${monster.name.english}** has evolved into **${evolution.name.english}** via trade!`,
                image: {
                  url: imgs[0],
                },
                thumbnail: {
                  url: imgs[1],
                },
                title: `${message.author.username}'s ${monster.name.english} is evolving!`,
              });

              await message.channel
                .send(embed)
                .then(() => {
                  return;
                })
                .catch(console.error);
            } else {
              return false;
            }
          } else {
            return false;
          }
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export async function confirmTrade(message: Message): Promise<any> {
  // ~trade accept

  const trades = await databaseClient<ITrade>(TradeTable)
    .select()
    .where({
      uid_to: message.author.id,
      active: 1,
    });

  if (trades.length) {
    const trade = trades[0];

    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: trade.monster_id })
      .update({ uid: message.author.id });

    if (updateMonster) {
      const monster_db = await getUserMonster(trade.monster_id);
      const monster = findMonsterByID(monster_db.monster_id);
      message.reply(
        `successfully traded over monster **${monster.name.english}**! Nice dude.`,
      );
      checkEvolves(trade.monster_id, message);

      await databaseClient<ITrade>(TradeTable)
        .where({ id: trade.id })
        .update({ active: 0, traded: 1 });

      await databaseClient<IMonsterUserModel>(MonsterUserTable)
        .where({ uid: message.author.id })
        .update({ latest_monster: trade.monster_id });
    } else {
      logger.error(
        `There was an error updating monster ${trade.monster_id} for a trade.`,
      );
    }
  } else {
    message.reply(`you don't have any trades to accept m8.`);
  }
}

export async function cancelTrade(message: Message): Promise<any> {
  const trades = await databaseClient<ITrade>(TradeTable)
    .select()
    .where({
      uid_to: message.author.id,
      active: 1,
    })
    .orWhere({
      uid_from: message.author.id,
      active: 1,
    });

  if (trades.length) {
    const trade = trades[0];

    const cancelTrade = await databaseClient<ITrade>(TradeTable)
      .where({ id: trade.id })
      .update({ active: 0 });

    if (cancelTrade) {
      message.reply(
        `successfully cancelled trade with monster #${trade.monster_id}.`,
      );
    }
  } else {
    message.reply(`you don't have any trades to cancel m8.`);
  }
}

export async function checkTrade(
  monster_id: number,
  to_user: number | string,
  message: Message,
): Promise<boolean> {
  const trades = await databaseClient<ITrade>(TradeTable)
    .select()
    .where({
      monster_id: monster_id,
      active: 1,
    });

  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      id: monster_id,
    });

  const users = await databaseClient<ITrade>(TradeTable)
    .select()
    .where({
      uid_to: to_user,
      uid_from: message.author.id,
      active: 1,
    });

  if (
    trades.length ||
    users.length ||
    pokemon.length == 0 ||
    pokemon[0].uid != message.author.id
  ) {
    return true;
  } else {
    return false;
  }
}
