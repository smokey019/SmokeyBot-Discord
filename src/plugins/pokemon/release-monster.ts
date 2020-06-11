import { Message } from 'discord.js';
import { databaseClient } from '../../clients/database';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { getAllMonsters } from './monsters';
import { getLogger } from '../../clients/logger';

const logger = getLogger('Pokemon');

export async function releaseMonster(message: Message): Promise<void> {
  const tmpMsg = message.content.split(' ');

  console.log(tmpMsg);

  if (tmpMsg.length > 1) {
    if (tmpMsg[1].toString().match(',')) {
      const multi_dump = tmpMsg[1].split(',');

      console.log(multi_dump);

      if (multi_dump.length < 10) {
        multi_dump.forEach(async (element) => {
          const to_release = await databaseClient<IMonsterModel>(MonsterTable)
            .select()
            .where('id', element);

          if (
            to_release &&
            !to_release[0].released &&
            to_release[0].uid == message.author.id
          ) {
            databaseClient<IMonsterModel>(MonsterTable)
              .where('id', to_release[0].id)
              .update({ released: 1 });
          }
        });

        message
          .reply(
            `Attempting to release ${multi_dump.length} monsters.. Good luck little guys :(`,
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
      const to_release = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .where('id', tmpMsg[1]);

      if (
        to_release &&
        !to_release[0].released &&
        to_release[0].uid == message.author.id
      ) {
        const monsters = getAllMonsters();

        const released_monster = await databaseClient<IMonsterModel>(
          MonsterTable,
        )
          .where('id', to_release[0].id)
          .update({ released: 1 });

        if (released_monster) {
          message
            .reply(
              `Successfully released your monster. Goodbye ${
                monsters[to_release[0].monster_id - 1].name.english
              } :(`,
            )
            .then(() => {
              logger.info(
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
}
