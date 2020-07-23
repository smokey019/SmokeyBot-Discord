import { Message } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { findMonsterByID } from './monsters';
import { getLogger } from '../../clients/logger';
import { explode } from '../../utils';
import { IMonsterUserModel } from '../../models/MonsterUser';

const logger = getLogger('Pokemon');

export async function releaseMonster(message: Message): Promise<void> {
  const tmpMsg = explode(message.content, ' ', 2);

  if (tmpMsg.length > 1) {
    if (tmpMsg[1].toString().match(',') || tmpMsg[1].toString().match(' ')) {
      let multi_dump = [];

      if (tmpMsg[1].toString().match(',')) {
        multi_dump = tmpMsg[1].replace(' ', '').split(',');
      } else if (tmpMsg[1].toString().match(' ')) {
        multi_dump = tmpMsg[1].replace(',', '').split(' ');
      }

      if (multi_dump.length < 35) {
        multi_dump.forEach(async (element) => {
          const to_release = await databaseClient<IMonsterModel>(MonsterTable)
            .select()
            .where('id', element);

          if (!to_release[0]) return;

          if (
            to_release &&
            !to_release[0].released &&
            to_release[0].uid == message.author.id
          ) {
            const released_monster = await databaseClient<IMonsterModel>(
              MonsterTable,
            )
              .where('id', to_release[0].id)
              .update({ released: 1 });

            if (released_monster) {
              logger.trace(`Successfully released a monster.`);
            }
          }
        });

        message
          .reply(
            `Attempting to release **${multi_dump.length}** monsters.. Good luck little guys :(`,
          )
          .then(() => {
            logger.info(
              `${message.author.username} Attempting to release your monsters.. Good luck little guys :(`,
            );
            return;
          })
          .catch(console.error);
      }
    } else {
      let to_release = undefined;

      if (tmpMsg[1] == '^') {
        const user: IMonsterUserModel = await getUser(message.author.id);
        to_release = await databaseClient<IMonsterModel>(MonsterTable)
          .select()
          .where('id', user.latest_monster);
      } else {
        to_release = await databaseClient<IMonsterModel>(MonsterTable)
          .select()
          .where('id', tmpMsg[1]);
      }

      if (!to_release) return;

      if (
        !to_release[0].released &&
        to_release[0].uid == message.author.id &&
        !to_release[0].released
      ) {
        const monster = findMonsterByID(to_release[0].monster_id);

        const released_monster = await databaseClient<IMonsterModel>(
          MonsterTable,
        )
          .where('id', to_release[0].id)
          .update({ released: 1 });

        if (released_monster) {
          message
            .reply(
              `Successfully released your monster. Goodbye **${monster.name.english}** :(`,
            )
            .then(() => {
              logger.trace(`Successfully released monster. :(`);
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
}

export async function recoverMonster(message: Message): Promise<void> {
  const tmpMsg = message.content.split(' ');

  if (tmpMsg.length > 1) {
    const to_release = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where('id', tmpMsg[1]);

    if (
      to_release &&
      to_release[0].released &&
      to_release[0].uid == message.author.id
    ) {
      const monster = findMonsterByID(to_release[0].monster_id);

      const released_monster = await databaseClient<IMonsterModel>(MonsterTable)
        .where('id', to_release[0].id)
        .update({ released: 0 });

      if (released_monster) {
        message
          .reply(
            `Successfully recovered your monster. Welcome back **${monster.name.english}**!`,
          )
          .then(() => {
            logger.info(
              `${message.author.username} Successfully recovered **${monster.name.english}**!`,
            );
            return;
          })
          .catch(console.error);
      }
    }
  }
}
