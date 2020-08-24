import { Message } from 'discord.js';
import { databaseClient } from '../../clients/database';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { getLogger } from '../../clients/logger';

const logger = getLogger('NEW DEX');

export async function updateDexes(message: Message): Promise<any> {
  if (message.author.id == '90514165138989056') {
    const users: Array<IMonsterUserModel> = await databaseClient<
      IMonsterUserModel
    >(MonsterUserTable).select();

    if (users) {
      users.forEach(async (user) => {
        const monsters = await databaseClient<IMonsterModel>(MonsterTable)
          .select()
          .where('uid', user.uid);

        if (monsters) {
          const newDex = [];
          monsters.forEach((monster) => {
            if (!newDex.includes(monster.monster_id)) {
              newDex.push(monster.monster_id);
            }
          });

          const updateUser = await databaseClient<IMonsterUserModel>(
            MonsterUserTable,
          )
            .update('dex', JSON.stringify(newDex))
            .where('id', user.id);

          if (updateUser) {
            logger.info('updated user dex');
          } else {
            logger.info('eror updating dex');
          }
        }
        {
          logger.info('no monsters');
        }
      });
    }
  }
}