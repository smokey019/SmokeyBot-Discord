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
import { IItemsModel, ItemsTable } from '../../models/Items';

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
  } else if (split[1] == 'update') {
    await updateItems(message);
  }
}

async function listItems(message: Message) {
  let item_message = [];

  const splitMsg = message.content.split(' ');

  itemDB.forEach((element) => {
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

async function msgUserItems(message: Message): Promise<any> {
  const splitMsg = message.content.replace(/ {2,}/gm, ' ').split(' ');
  const isQuote = message.content.match('"');
  let sort = undefined;
  let search = undefined;
  let page = 0;

  if (isQuote) {
    const parseSearch = message.content.replace(/ {2,}/gm, ' ').split('"');
    const splitSort = parseSearch[parseSearch.length - 1].split(' ');
    search = parseSearch[1].toLowerCase();
    if (splitSort.length == 3) {
      sort = [splitSort[1], splitSort[2]];
    } else if (splitSort.length == 4) {
      sort = [splitSort[1], splitSort[2]];
      page = parseInt(splitSort[splitSort.length - 1]) - 1;
    }
  } else {
    const parseSearch = message.content.replace(/ {2,}/gm, ' ').split(' ');
    sort = [splitMsg[2], splitMsg[3]];
    search = parseSearch[1].toLowerCase();
  }
  const sortable_items = [];
  const items = await getUserItems(message.author.id);

  if (items && items.length > 0) {
    let item_message = [];

    const splitMsg = message.content.split(' ');

    items.forEach((element) => {
      const item_dex = getItemByID(element.item_number);
      if (!item_dex) return;

      if (
        (isQuote && item_dex.name.english.toLowerCase() != search) ||
        (sort[0] == 'evolve' && !item_dex?.evolve_item)
      )
        return;
      const tmpMsg = `ID: **${item_dex.id}** - **${item_dex.name.english}**`;
      item_message.push(tmpMsg);

      sortable_items.push({
        id: element.id,
        item_number: element.item_number,
        name: item_dex.name.english,
        msg: tmpMsg,
      });
    });

    if (sort[0] == 'number' && sort[1] == 'high') {
      sortable_items.sort(function(a, b) {
        return b.item_number - a.item_number;
      });
    } else if (sort[0] == 'number' && sort[1] == 'low') {
      sortable_items.sort(function(a, b) {
        return a.item_number - b.item_number;
      });
    } else if (sort[0] == 'id' && sort[1] == 'high') {
      sortable_items.sort(function(a, b) {
        return b.id - a.id;
      });
    } else if (sort[0] == 'id' && sort[1] == 'low') {
      sortable_items.sort(function(a, b) {
        return a.id - b.id;
      });
    } else if (sort[0] == 'name' && sort[1] == 'desc') {
      sortable_items.sort(function(a, b) {
        return b.name - a.name;
      });
    } else if (sort[0] == 'name' && sort[1] == 'asc') {
      sortable_items.sort(function(a, b) {
        return a.name - b.name;
      });
    } else {
      sortable_items.sort(function(a, b) {
        return b.id - a.id;
      });
    }

    sortable_items.forEach((element) => {
      item_message.push(element.msg);
    });

    let all_items = [];

    if (item_message.length > 10) {
      all_items = chunk(item_message, 10);

      if (splitMsg.length == 3 && all_items.length > 1) {
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

async function updateItems(message: Message): Promise<boolean> {
  const user = await getUser(message.author.id);
  const items = JSON.parse(user.items);

  if (items) {
    let updated_items = 0;
    items.forEach(async (element) => {
      const update = await databaseClient<IItemsModel>(ItemsTable).insert({
        item_number: element,
        uid: message.author.id,
      });
      if (update) {
        updated_items++;
      }
    });
    if (updated_items > 0) {
      message.reply(
        `successfully transferred ${updated_items} to the new item inventory!`,
      );
      await databaseClient<IMonsterUserModel>(MonsterUserTable)
        .update('items', '[]')
        .where('uid', message.author.id);
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

async function removeMonsterItem(message: Message) {
  const user = await getUser(message.author.id);
  const split = explode(message.content, ' ', 3);
  let monster: IMonsterModel = undefined;
  if (split[2] == 'current') {
    monster = await getUserMonster(user.current_monster);
  } else {
    monster = await getUserMonster(split[2]);
  }

  if (
    user &&
    split.length == 3 &&
    monster.uid == message.author.id &&
    monster.held_item
  ) {
    const itemDex = getItemByID(monster.held_item);
    const monsterDex = findMonsterByID(monster.monster_id);

    const updateItem = await databaseClient<IItemsModel>(ItemsTable)
      .where({ id: monster.held_item })
      .update({ held_by: null });

    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ held_item: null });

    if (updateItem && updateMonster) {
      message.reply(
        `removed item **${itemDex.name.english}** from **${monsterDex.name.english}**.`,
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
    const itemDB = await getItemDB(monster.held_item);
    const item = getItemByID(itemDB.item_number);

    if (monster_dex.evos) {
      monster_dex.evos.forEach((evo) => {
        const tmpEvo = findMonsterByName(evo);
        if (!tmpEvo || !tmpEvo.evoItem) return;
        if (tmpEvo.evoItem == item.name.english) {
          evolve = tmpEvo;
        }
      });
    } else if (monster_dex.otherFormes) {
      monster_dex.otherFormes.forEach((evo) => {
        const tmpEvo = findMonsterByName(evo);
        if (!tmpEvo || !tmpEvo.evoItem) return;
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
        await deleteItemDB(monster.held_item);
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
          .catch(console.error);
      }
    }
  }
}

async function giveMonsterItem(message: Message) {
  const user: IMonsterUserModel = await getUser(message.author.id);
  const split = explode(message.content, ' ', 4);
  let monster: IMonsterModel = undefined;

  if (user && split.length == 4) {
    const item = await getUserItemDB(parseInt(split[2]), message.author.id);

    if (split[3] == 'current') {
      monster = await getUserMonster(user.current_monster);
    } else {
      monster = await getUserMonster(split[3]);
    }

    if (!monster) {
      message.reply("that monster doesn't exist..");
      return;
    }

    if (item && monster.uid == message.author.id && !monster.held_item) {
      if (item.item_number == 50 && monster.level < 100) {
        const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
          .where({ id: monster.id })
          .increment('level', 1);

        const deleteItem = await deleteItemDB(item.id);

        if (deleteItem && updateMonster) {
          const itemDex = getItemByID(item.item_number);
          const monsterDex = findMonsterByID(monster.monster_id);
          message.reply(
            `gave **${monsterDex.name.english}** a **${itemDex.name.english}** and it leveled up! Neato!`,
          );
        }
        return;
      } else {
        const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
          .where({ id: monster.id })
          .update({ held_item: item.id });

        const updateItem = await databaseClient<IItemsModel>(ItemsTable)
          .update('held_by', monster.id)
          .where({
            id: item.id,
          });

        if (updateItem && updateMonster) {
          monster.held_item = item.id;
          const itemDex = getItemByID(item.item_number);
          const monsterDex = findMonsterByID(monster.monster_id);
          message.reply(
            `gave **${monsterDex.name.english}** an item - **${itemDex.name.english}**! Neato!`,
          );
          await checkItemEvolution(monster, message);
          return;
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
      const create_item = await createItemDB({
        item_number: item_to_buy.id,
        uid: message.author.id,
      });

      if (create_item) {
        const updateUser = await databaseClient<IMonsterUserModel>(
          MonsterUserTable,
        )
          .where({ uid: message.author.id })
          .decrement('currency', item_to_buy.price);

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
}

export async function msgBalance(message: Message): Promise<any> {
  const user = await getUser(message.author.id);
  if (user) {
    message.reply(
      `your current balance is **${format_number(user.currency)}**.`,
    );
  }
}

function getItemByName(item: string): Iitem {
  let temp = undefined;
  Items.forEach((element) => {
    if (element.name.english.toLowerCase() == item.toLowerCase()) {
      temp = element;
    }
  });
  return temp;
}

function getItemByID(item: number): Iitem {
  let temp = undefined;
  Items.forEach((element) => {
    if (element.id == item) {
      temp = element;
    }
  });
  return temp;
}

async function getItemDB(id: number | string): Promise<IItemsModel> {
  const item = await databaseClient<IItemsModel>(ItemsTable)
    .first()
    .where('id', id);
  return item;
}

async function getUserItemDB(id: number, uid: string): Promise<IItemsModel> {
  const item = await databaseClient<IItemsModel>(ItemsTable)
    .first()
    .where({
      id: id,
      uid: uid,
    });
  return item;
}

async function deleteItemDB(id: number | string): Promise<number> {
  const item = await databaseClient<IItemsModel>(ItemsTable)
    .delete()
    .where('id', id);
  return item;
}

async function sellItemDB(
  item_id: number | string,
  uid: number | string,
  currency: number,
): Promise<boolean> {
  const add_currency = await databaseClient<IMonsterUserModel>(MonsterUserTable)
    .where('uid', uid)
    .increment('currency', currency);

  if (add_currency) {
    const deleteItem = await deleteItemDB(item_id);

    if (deleteItem) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

async function createItemDB(data: IItemsModel): Promise<Array<number>> {
  const item = await databaseClient<IItemsModel>(ItemsTable).insert(data);
  return item;
}

async function getUserItems(uid: number | string): Promise<Array<IItemsModel>> {
  const items = await databaseClient<IItemsModel>(ItemsTable)
    .select()
    .where('uid', uid);
  return items;
}
