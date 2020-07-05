import Items from './data/items.json';
import { Message, MessageEmbed } from 'discord.js';
import { getMonsterUser, databaseClient } from '../../clients/database';
import { explode, format_number, chunk } from '../../utils';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { getUserMonster, findMonsterByID, getAllMonsters } from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { COLOR_PURPLE } from '../../colors';

export type Iitem = typeof Items[1];

export const itemDB = Items;

export async function parseItems(message: Message): Promise<any> {
  const split = message.content.split(' ');

  // ~item buy

  if (split[1] == 'buy') {
    await buyItem(message);
  } else if (split[1] == 'remove' || split[1] == '-') {
    await removeMonsterItem(message);
  } else if (split[1] == 'balance') {
    await msgBalance(message);
  } else if (split[1] == 'give' || split[1] == '+') {
    await giveMonsterItem(message);
  } else if (split[1] == 'list' || split[1] == 'items' || split[1] == '=') {
    await msgUserItems(message);
  } else if (split[1] == 'shop') {
    await listItems(message);
  }
}

async function listItems(message: Message) {
  const items = itemDB;

  let item_message = [];

  const splitMsg = message.content.split(' ');

  items.forEach((element) => {
    item_message.push(`${element.id} - ${element.name.english}`);
  });

  let all_items = [];

  if (item_message.length > 15) {
    all_items = chunk(item_message, 15);

    if (splitMsg.length == 3 && all_items.length > 1) {
      const page = parseInt(splitMsg[2]) - 1;

      if (all_items[page]) {
        item_message = all_items[page];
      }
    } else {
      item_message = all_items[0];
    }
  }

  const new_msg = item_message.join('\n');

  const embed = new MessageEmbed()
    .setAuthor(
      `Poké Mart`,
      `https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png`,
    )
    .setColor(0xff0000)
    .setDescription(new_msg);
  await message.channel
    .send(embed)
    .then((message) => {
      return message;
    })
    .catch(console.error);
}

export async function msgUserItems(message: Message): Promise<any> {
  const user = await getMonsterUser(message.author.id);

  if (user) {
    const items = JSON.parse(user.items);

    if (items.length > 0) {
      const item_message = [];

      items.forEach((element) => {
        const item_dex = getItemByID(element);
        item_message.push(`${item_dex.id} - ${item_dex.name.english}`);
      });

      const response = item_message.join(' | ');

      message.reply(`Total items: ${items.length}\n\n` + response);
    }
  }
}

async function removeMonsterItem(message: Message) {
  const user = await getMonsterUser(message.author.id);
  const split = explode(message.content, ' ', 3);
  const monster = await getUserMonster(split[2]);

  if (user && split.length == 3 && monster.uid == message.author.id) {
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

export async function checkItemEvolution(
  monster: IMonsterModel,
  message: Message,
  isTrade = false,
): Promise<any> {
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
        if (
          evolve.evoType == 'useItem' ||
          (evolve.evoType == 'trade' && isTrade) ||
          (evolve.evoType == 'levelFriendship' && monster.held_item == 960) ||
          (evolve.requiredItem && evolve.forme == 'Mega')
        ) {
          const item = getItemByID(monster.held_item);

          if (
            item.name.english == evolve.evoItem ||
            (evolve.evoType == 'levelFriendship' && monster.held_item == 960) ||
            (evolve.requiredItem && item.name.english == evolve.requiredItem)
          ) {
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
                color: COLOR_PURPLE,
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

async function giveMonsterItem(message: Message) {
  const user = await getMonsterUser(message.author.id);
  const split = explode(message.content, ' ', 4);

  if (user && split.length == 4) {
    const item = parseInt(split[2]);
    const monster = await getUserMonster(split[3]);
    const items = JSON.parse(user.items);

    if (!monster) {
      message.reply('there was an error giving item');
    }

    if (
      items.length > 0 &&
      monster.uid == message.author.id &&
      !monster.held_item
    ) {
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
            monster.held_item = item;
            message.reply(`gave ${monster.id} an item!`);
            await checkItemEvolution(monster, message);
          }
        }
      }
    }
  }
}

async function buyItem(message: Message) {
  const user = await getMonsterUser(message.author.id);
  const split = explode(message.content, ' ', 3);

  if (user && split.length) {
    const item_to_buy =
      getItemByID(parseInt(split[2])) || getItemByName(split[2]);

    if (item_to_buy && user.currency >= 1000) {
      user.items = JSON.parse(user.items);

      user.items.push(item_to_buy.id);

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

export async function msgBalance(message: Message): Promise<any> {
  const user = await getMonsterUser(message.author.id);

  if (user) {
    message.reply(`your balance is ${format_number(user.currency)}.`);
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
