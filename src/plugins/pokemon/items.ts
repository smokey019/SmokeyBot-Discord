import Items from './data/items.json';
import { Message, MessageEmbed } from 'discord.js';
import { getMonsterUser, databaseClient } from '../../clients/database';
import { explode, format_number } from '../../utils';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { getUserMonster, findMonsterByID, getAllMonsters } from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';

export type Iitem = typeof Items[1];

export const itemDB = Items;

export async function removeMonsterItem(message: Message): Promise<any> {
  const user = await getMonsterUser(message.author.id);
  const split = explode(message.content, ' ', 2);
  const monster = await getUserMonster(split[1]);

  if (user) {
    const items = JSON.parse(user.items);

    items.push(monster.held_item);

    const updateUser = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: message.author.id })
      .update({ items: JSON.stringify(items) });

    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ held_item: null });

    if (updateUser && updateMonster) {
      message.reply(`removed ${monster.id}'s item!`);
    }
  }
}

async function checkItemEvolution(
  monster_id: number,
  message: Message,
): Promise<any> {
  const monster = await getUserMonster(monster_id);
  const monster_dex = findMonsterByID(monster.monster_id);

  if (monster_dex.evos && monster.held_item != 229) {
    const allMonsters = getAllMonsters();

    let evolve = undefined;
    allMonsters.forEach(async (element) => {
      if (!element.forme) {
        if (
          element.name.english.toLowerCase() ==
          monster_dex.evos[0].toLowerCase()
        ) {
          evolve = element;
        }
      }
    });

    if (evolve.evoType || evolve.otherFormes) {
      if (evolve.evoType) {
        if (evolve.evoType == 'useItem') {
          const item = getItemByID(monster.held_item);

          if (item.name.english == evolve.evoItem) {
            const updateMonster = await databaseClient<IMonsterModel>(
              MonsterTable,
            )
              .where({ id: monster.id })
              .update({ monster_id: evolve.id, held_item: null });

            if (updateMonster) {
              let imgs = [];
              if (monster.shiny) {
                imgs = [evolve.images.shiny, monster_dex.images.shiny];
              } else {
                imgs = [evolve.images.normal, monster_dex.images.normal];
              }
              const embed = new MessageEmbed({
                color: 0x00bc8c,
                description: `Nice! **${monster_dex.name.english}** has evolved into **${evolve.name.english}** with held item **${item.name.english}**!`,
                image: {
                  url: imgs[0],
                },
                thumbnail: {
                  url: imgs[1],
                },
                title: `${message.author.username}'s ${monster_dex.name.english} is evolving!`,
              });

              await message.channel
                .send(embed)
                .then(() => {
                  return;
                })
                .catch(console.error);
            }
          }
        }
      }
    }
  }
}

export async function giveMonsterItem(message: Message): Promise<any> {
  const user = await getMonsterUser(message.author.id);
  const split = explode(message.content, ' ', 3);
  const item = parseInt(split[1]);
  const monster = await getUserMonster(split[2]);

  if (user) {
    const items = JSON.parse(user.items);

    if (items.length > 0) {
      for (let index = 0; index < items.length; index++) {
        const element = items[index];
        if (element == item) {
          items.splice(index, 1);

          const updateUser = await databaseClient<IMonsterUserModel>(
            MonsterUserTable,
          )
            .where({ uid: message.author.id })
            .update({ items: JSON.stringify(items) });

          const updateMonster = await databaseClient<IMonsterModel>(
            MonsterTable,
          )
            .where({ id: monster.id })
            .update({ held_item: item });

          if (updateUser && updateMonster) {
            message.reply(`gave ${monster.id} a item!`);
          }
        }
      }
    }
  }
}

export async function buyItem(message: Message): Promise<any> {
  const user = await getMonsterUser(message.author.id);
  const split = explode(message.content, ' ', 2);

  if (user && split.length) {
    const item_to_buy =
      getItemByID(parseInt(split[1])) || getItemByName(split[1]);

    if (item_to_buy && user.currency >= 1000) {
      user.items = JSON.parse(user.items);

      user.items.push(item_to_buy);

      const updateUser = await databaseClient<IMonsterUserModel>(
        MonsterUserTable,
      )
        .where({ uid: message.author.id })
        .decrement('currency', 1000)
        .update({ items: JSON.stringify(user.items) });

      if (updateUser) {
        message.reply(
          `you have purchased **${
            item_to_buy.name.english
          }**! Current Balance: **${format_number(user.currency - 1000)}**.`,
        );
      }
    }
  }
}

export async function checkCurrency(uid: number | string): Promise<number> {
  const user = await getMonsterUser(uid);

  if (user) {
    return user.currency;
  } else {
    return -1;
  }
}

export function getItemByName(item: string): Iitem {
  let temp = undefined;
  Items.forEach((element) => {
    if (element.name.english.toLowerCase() == item.toLowerCase()) {
      temp = element;
    }
  });
  return temp;
}

export function getItemByID(item: number): Iitem {
  let temp = undefined;
  Items.forEach((element) => {
    if (element.id == item) {
      temp = element;
    }
  });
  return temp;
}
