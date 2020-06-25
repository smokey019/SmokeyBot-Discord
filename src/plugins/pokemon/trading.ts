import { getLogger } from '../../clients/logger';
import { Message } from 'discord.js';
import { getMonsterUser, databaseClient } from '../../clients/database';
import { ITrade, TradeTable } from '../../models/Trades';
import { getCurrentTime, theWord } from '../../utils';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { findMonsterByID, IMonsterDex, findMonsterByName } from './monsters';

const logger = getLogger('Pokemon-Trade');

export async function startTrade(message: Message): Promise<any> {
  // ~trade start @mention id-for-monster
  const split = message.content.split(' ');
  const traded_monster = parseInt(split[3]);
  const mentions: Array<any> = Array.from(message.mentions.users);

  if (mentions.length > 0) {
    const to_user = mentions[0].id;

    const recipient = await getMonsterUser(to_user);

    if (recipient && !checkTrade(traded_monster, to_user, message)) {
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
          `initiated trade with <@${to_user}> - if <@${to_user}> wants to accept the trade type ~trade accept!`,
        );
      } else {
        logger.error(`DB error while inserting trade.`);
      }
    } else if (!recipient) {
      message.reply(
        `could not find user <@${to_user}>, make them catch a ${theWord()} first!`,
      );
    } else if (checkTrade(traded_monster, to_user, message)) {
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

  if (db_monster) {
    const monster: IMonsterDex = findMonsterByID(db_monster[0].monster_id);

    if (monster.evos) {
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
              message.reply(
                `WHOA! ${monster.name.english} evolved into ${evolution.name.english} via trade! Neato!`,
              );
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
      to_uid: message.author.id,
    });

  if (trades) {
    const trade = trades[0];

    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ monster_id: trade.monster_id })
      .update({ uid: message.author.id });

    if (updateMonster) {
      message.reply(
        `successfully traded over monster #${trade.monster_id} from <@${trade.from_uid}>. Nice dude.`,
      );
      checkEvolves(trade.monster_id, message);
    } else {
      logger.error(
        `There was an error updating monster ${trade.monster.id} for a trade.`,
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
      to_uid: message.author.id,
      active: 1,
    });

  if (trades) {
    const trade = trades[0];

    const cancelTrade = await databaseClient<ITrade>(TradeTable)
      .where({ id: trade.id })
      .update({ active: 0 });

    if (cancelTrade) {
      message.reply(
        `successfully cancelled trade with monster #${trade.monster_id} with user <@${trade.from_uid}>.`,
      );
    }
  } else {
    message.reply(`you don't have any trades to cancel m8.`);
  }
}

export async function checkTrade(
  monster_id: number,
  to_user: number,
  message: Message,
): Promise<boolean> {
  const pokemon = await databaseClient<ITrade>(TradeTable)
    .select()
    .where({
      monster_id: monster_id,
    });

  const users = await databaseClient<ITrade>(TradeTable)
    .select()
    .where({
      to_uid: to_user,
      from_uid: message.author.id,
    });

  if (pokemon.length > 0 || users.length > 0) {
    return true;
  } else {
    return false;
  }
}
