import { CommandInteraction } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel } from '../../models/MonsterUser';
import { findMonsterByID, getUserMonster } from './monsters';

const logger = getLogger('Pokémon');

/**
 * Release a monster
 * @param monster_id
 * @returns true on success
 */
async function release(monster_id: number | string): Promise<boolean> {
  const released_monster = await databaseClient<IMonsterModel>(MonsterTable)
    .where('id', monster_id)
    .update({ released: 1, released_at: Date.now() });

  if (released_monster) {
    logger.trace(`Successfully released a monster.`);
    return true;
  } else {
    return false;
  }
}

/**
 * Recover a monster
 * @param monster_id
 * @returns true on success
 */
async function recover(monster_id: number | string): Promise<boolean> {
  const recover = await databaseClient<IMonsterModel>(MonsterTable)
    .where('id', monster_id)
    .update({ released: 0 });

  if (recover) {
    logger.trace(`Successfully recovered a monster.`);
    return true;
  } else {
    return false;
  }
}

export async function releaseMonsterNew(
  interaction: CommandInteraction,
): Promise<void> {
  let monster = await getUserMonster(interaction.options.getString('pokemon'));

  if (monster) {
    const monster_dex = await findMonsterByID(monster.monster_id);
    await release(monster.id);
    queueMsg(
      `Successfully released ${monster_dex.name.english}.`,
      interaction,
      true,
    );
  } else {
    const user: IMonsterUserModel = await getUser(interaction.user.id);
    monster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where('id', user.latest_monster)
      .first();
    await release(monster.id);

    const monster_dex = await findMonsterByID(monster.monster_id);
    queueMsg(
      `Successfully released ${monster_dex.name.english}.`,
      interaction,
      true,
    );
  }
}

export async function releaseMonster(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  const tmpMsg = args;

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
          if (isNaN(element)) return;

          const to_release = await getUserMonster(element);

          if (!to_release) return;

          if (
            to_release &&
            !to_release.released &&
            to_release.uid == interaction.user.id
          ) {
            await release(to_release.id);
          }
        });

        queueMsg(
          `Attempting to release **${multi_dump.length}** monsters.. Good luck little guys :(`,
          interaction,
          true,
        );
      }
    } else {
      let to_release = undefined;

      if (tmpMsg[1] == '^') {
        const user: IMonsterUserModel = await getUser(interaction.user.id);
        to_release = await getUserMonster(user.latest_monster);
      } else {
        if (isNaN(parseInt(tmpMsg[1]))) return;
        to_release = await getUserMonster(tmpMsg[1]);
      }

      if (!to_release) return;

      if (
        !to_release.released &&
        to_release.uid == interaction.user.id &&
        !to_release.released
      ) {
        const monster = await findMonsterByID(to_release.monster_id);

        const released_monster = await release(to_release.id);

        if (released_monster) {
          queueMsg(
            `Successfully released your monster. Goodbye **${monster.name.english}** :(`,
            interaction,
            true,
          );
        }
      }
    }
  } else {
    (interaction as CommandInteraction)
      .reply({ content: `Not enough things in ur msg there m8`, ephemeral: true })
      .then(() => {
        logger.debug(
          `${interaction.user.username} not enough things in ur msg there m8`,
        );
        return;
      })
      .catch((error) => logger.error(error));
  }
}

export async function recoverMonster(
  interaction: CommandInteraction,
): Promise<void> {
  const to_release = await getUserMonster(
    interaction.options.getString('pokemon'),
  );
  if (!to_release){
    interaction.reply({ content: 'There was an error processing your request.', ephemeral: true })
    return;
  }

  if (
    to_release &&
    to_release.released &&
    to_release.uid == interaction.user.id
  ) {
    const monster = await findMonsterByID(to_release.monster_id);

    const released_monster = await recover(to_release.id);

    if (released_monster) {
      queueMsg(
        `Successfully recovered your monster. Welcome back **${monster.name.english}**!`,
        interaction,
        true,
      );
    }
  }
}
