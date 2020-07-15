import Items from './data/items.json';
import { Message, MessageEmbed } from 'discord.js';
import { getUser, databaseClient } from '../../clients/database';
import { explode, format_number, chunk } from '../../utils';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import {
  getUserMonster,
  findMonsterByID,
  IMonsterDex,
  findMonsterByName,
} from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { getLogger } from 'log4js';

const logger = getLogger('Items');

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
    item_message.push(
      `ID: ${element.id} - Name: ${
        element.name.english
      } - Price: ${format_number(element.price)}`,
    );
  });

  let all_items = [];

  if (item_message.length > 10) {
    all_items = chunk(item_message, 10);

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
  const user = await getUser(message.author.id);

  if (user) {
    const items = JSON.parse(user.items);

    if (items.length > 0) {
      let item_message = [];

      const splitMsg = message.content.split(' ');

      items.forEach((element) => {
        const item_dex = getItemByID(element);
        if (!item_dex) return;
        item_message.push(
          `ID: **${item_dex.id}** - **${item_dex.name.english}**`,
        );
      });

      let all_items = [];

      if (item_message.length > 10) {
        all_items = chunk(item_message, 10);

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
          `${message.author.username}'s Items - Total: ${items.length} - Pages: ${all_items.length}`,
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
  }
}

async function removeMonsterItem(message: Message) {
  const user = await getUser(message.author.id);
  const split = explode(message.content, ' ', 3);
  const monster = await getUserMonster(split[2]);

  if (
    user &&
    split.length == 3 &&
    monster.uid == message.author.id &&
    monster.held_item
  ) {
    const items = JSON.parse(user.items);

    items.push(monster.held_item);

    const itemDex = getItemByID(monster.held_item);
    const monsterDex = findMonsterByID(monster.monster_id);

    const updateUser = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: message.author.id })
      .update({ items: JSON.stringify(items) });

    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ held_item: null });

    if (updateUser && updateMonster) {
      message.reply(
        `removed **${monsterDex.name.english}**'s item - **${itemDex.name.english}**.`,
      );
    }
  }
}

export async function checkItemEvolution(
  monster: IMonsterModel,
  message: Message,
  isTrade = false,
): Promise<any> {
  const monster_dex: IMonsterDex = findMonsterByID(monster.monster_id);

  if (
    (monster_dex.evos && monster.held_item != 229) ||
    monster_dex.otherFormes
  ) {
    let evolve: IMonsterDex = undefined;
    const item = getItemByID(monster.held_item);

    if (monster_dex.evos) {
      monster_dex.evos.forEach((evo) => {
        const tmpEvo = findMonsterByName(evo);
        if (!tmpEvo.evoItem) return;
        if (tmpEvo.evoItem == item.name.english) {
          evolve = tmpEvo;
        }
      });
    } else if (monster_dex.otherFormes) {
      monster_dex.otherFormes.forEach((evo) => {
        const tmpEvo = findMonsterByName(evo);
        if (!tmpEvo.evoItem) return;
        if (tmpEvo.evoItem == item.name.english) {
          evolve = tmpEvo;
        }
      });
    }

    if (
      evolve != undefined ||
      evolve.evoItem == item.name.english ||
      (evolve.evoType == 'levelFriendship' && monster.held_item == 960) ||
      (evolve.evoType == 'trade' && isTrade)
    ) {
      let updateMonster = undefined;
      if (!evolve.forme) {
        updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
          .where({ id: monster.id })
          .update({ monster_id: evolve.id, held_item: null });
      } else {
        updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
          .where({ id: monster.id })
          .update({
            monster_id: evolve.id,
            held_item: null,
          });
      }

      if (updateMonster) {
        let imgs = [];
        if (monster.shiny) {
          imgs = [evolve.images.shiny, monster_dex.images.shiny];
        } else {
          imgs = [evolve.images.normal, monster_dex.images.normal];
        }
        const embed = new MessageEmbed({
          color: evolve.color,
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
          .catch(logger.error);
      }
    }
  }
}

async function giveMonsterItem(message: Message) {
  const user = await getUser(message.author.id);
  const split = explode(message.content, ' ', 4);

  if (user && split.length == 4) {
    const item = parseInt(split[2]);
    const monster = await getUserMonster(split[3]);
    const items = JSON.parse(user.items);

    if (!monster) {
      message.reply('there was an error giving item.');
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
            const itemDex = getItemByID(item);
            const monsterDex = findMonsterByID(monster.monster_id);
            message.reply(
              `gave **${monsterDex.name.english}** an item - **${itemDex.name.english}**! Neato!`,
            );
            await checkItemEvolution(monster, message);
          }
        }
      }
    }
  }
}

async function buyItem(message: Message) {
  const user = await getUser(message.author.id);
  const split = explode(message.content, ' ', 3);

  if (user && split.length) {
    const item_to_buy =
      getItemByID(parseInt(split[2])) || getItemByName(split[2]);

    if (item_to_buy && user.currency >= item_to_buy.price) {
      const items = JSON.parse(user.items);

      items.push(item_to_buy.id);

      const updateUser = await databaseClient<IMonsterUserModel>(
        MonsterUserTable,
      )
        .where({ uid: message.author.id })
        .decrement('currency', item_to_buy.price)
        .update({ items: JSON.stringify(items) });

      if (updateUser) {
        message.reply(
          `you have purchased **${
            item_to_buy.name.english
          }** for **${format_number(
            item_to_buy.price,
          )}**! Remaining Balance: **${format_number(
            user.currency - item_to_buy.price,
          )}**.`,
        );
      }
    }
  }
}

export async function checkCurrency(uid: number | string): Promise<number> {
  const user = await getUser(uid);

  if (user) {
    return user.currency;
  } else {
    return -1;
  }
}

export async function msgBalance(message: Message): Promise<any> {
  const user = await getUser(message.author.id);

  if (user) {
    message.reply(
      `your current balance is **${format_number(user.currency)}**.`,
    );
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
