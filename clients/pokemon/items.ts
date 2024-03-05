import {
  EmbedBuilder,
  type CommandInteraction
} from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { COLOR_BLUE } from '../../colors';
import { ItemsTable, type IItemsModel } from '../../models/Items';
import { MonsterTable, type IMonsterModel } from '../../models/Monster';
import { MonsterUserTable, type IMonsterUserModel } from '../../models/MonsterUser';
import { asyncForEach, chunk, format_number } from '../../utils';
import { queueMsg } from '../emote_queue';
import Items from './data/items_min.json';
import {
  findMonsterByID,
  findMonsterByName,
  getUserMonster,
  type IMonsterDex
} from './monsters';

export type Iitem = typeof Items[1];

export const itemDB = Items;

export async function parseItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  const command = (interaction as CommandInteraction).commandName;

  if (command == 'buy') {
    await buyItem(interaction, args);
  } else if (command == 'remove' || command == '-') {
    await removeMonsterItem(interaction, args);
  } else if (command == 'balance') {
    await msgBalance(interaction);
  } else if (command == 'give' || command == '+') {
    await giveMonsterItem(interaction, args);
  } else if (command == 'list' || command == 'items' || command == '=') {
    await msgUserItems(interaction, args);
  } else if (command == 'shop') {
    await listItems(interaction, args);
  } else if (command == 'update') {
    await updateItems(interaction);
  }
}

async function listItems(interaction: CommandInteraction, args: string[]) {
  let item_message = [];

  const splitMsg = args;

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

  const embed = new EmbedBuilder({
    color: 0xff0000 as unknown as number,
    description: new_msg,
    thumbnail: {
      url: `https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png`,
    },
    title: `Poké Mart`
  });

  queueMsg(embed, interaction, false, 0, undefined, true);
}

async function msgUserItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  const isQuote = false;
  const sort = ['id', 'high'];
  let search = undefined;
  let page = 0;

  args.shift();

  if (!isNaN(parseInt(args[args.length - 1]))) {
    page = parseInt(args[args.length - 1]);
    args.splice(args.length - 1, 1);
    search = args.join(' ');
  } else if (args.length >= 2 && isNaN(parseInt(args[args.length - 1]))) {
    page = 0;
    search = args.join(' ');
  } else if (args.includes('evolve')) {
    search = 'Evolve Items';
  } else {
    search = args.join(' ');
  }

  const sortable_items = [];
  const items = await getUserItems(interaction.user.id);

  if (items && items.length > 0) {
    let item_message = [];

    await asyncForEach(items, async (element) => {
      const item_dex = getItemByID(element.item_number);
      if (!item_dex) return;

      if (
        (isQuote &&
          item_dex.name.english.toLowerCase() != search &&
          search != 'Evolve Items') ||
        (args.includes('evolve') &&
          !item_dex?.evolve_item &&
          search == 'Evolve Items') ||
        (search != undefined &&
          !item_dex.name.english.toLowerCase().match(`${search}`) &&
          search != 'Evolve Items')
      )
        return;

      const tmpMsg = `ID: **${element.id}** - **${item_dex.name.english}** i№: ${item_dex.id}`;

      item_message.push(tmpMsg);
      sortable_items.push({
        id: element.id,
        item_number: element.item_number,
        name: item_dex.name.english,
        msg: tmpMsg,
      });
    });

    if (sort[0] == 'number' && sort[1] == 'high') {
      sortable_items.sort(function (a, b) {
        return b.item_number - a.item_number;
      });
    } else if (sort[0] == 'number' && sort[1] == 'low') {
      sortable_items.sort(function (a, b) {
        return a.item_number - b.item_number;
      });
    } else if (sort[0] == 'id' && sort[1] == 'high') {
      sortable_items.sort(function (a, b) {
        return b.id - a.id;
      });
    } else if (sort[0] == 'id' && sort[1] == 'low') {
      sortable_items.sort(function (a, b) {
        return a.id - b.id;
      });
    } else if (sort[0] == 'name' && sort[1] == 'desc') {
      sortable_items.sort(function (a, b) {
        return b.name - a.name;
      });
    } else if (sort[0] == 'name' && sort[1] == 'asc') {
      sortable_items.sort(function (a, b) {
        return a.name - b.name;
      });
    } else {
      sortable_items.sort(function (a, b) {
        return b.id - a.id;
      });
    }

    await asyncForEach(sortable_items, async (element) => {
      if (!item_message.includes(element.msg)) {
        item_message.push(element.msg);
      }
    });

    if (item_message.length > 10) {
      const all_items = chunk(item_message, 10);

      if (page > 0 && all_items.length > 1) {
        if (all_items[page]) {
          item_message = all_items[page];

          item_message.push(`Page: **${page}/${all_items.length}**`);
        }
      } else {
        item_message = all_items[0];

        item_message.push(`Page: **1/${all_items.length}**`);
      }
    }

    const new_msg = item_message.join('\n');

    const embed = new EmbedBuilder({
      color: COLOR_BLUE as unknown as number,
      description: new_msg,
      thumbnail: {
        url: `https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png`,
      },
      title: `${interaction.user.username}'s search for '${search}' \nFound: ${sortable_items.length} \nTotal Items: ${items.length}`
    });

    queueMsg(embed, interaction, false, 0, undefined, true);
  }
}

async function updateItems(interaction: CommandInteraction): Promise<boolean> {
  const user = await getUser(interaction.user.id);
  const items = JSON.parse(user.items);

  if (items.length > 0) {
    items.forEach(async (element) => {
      await databaseClient<IItemsModel>(ItemsTable).insert({
        item_number: element,
        uid: interaction.user.id,
      });
    });
    await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .update('items', '[]')
      .where('uid', interaction.user.id);

    const newItems = await getUserItems(interaction.user.id);
    (interaction as CommandInteraction).reply(
      `Successfully transferred ${newItems.length} to the new item inventory!`,
    );
    return true;
  } else {
    (interaction as CommandInteraction).reply(
      `You don't have any old items!`,
    );
    return false;
  }
}

async function removeMonsterItem(interaction: CommandInteraction, args: string[]) {
  const user = await getUser(interaction.user.id);
  const split = args;
  let monster: IMonsterModel = undefined;
  if (split[2] == 'current') {
    monster = await getUserMonster(user.current_monster);
  } else {
    monster = await getUserMonster(split[2]);
  }

  if (
    user &&
    split.length == 3 &&
    monster.uid == interaction.user.id &&
    monster.held_item
  ) {
    const item = await getItemDB(monster.held_item);
    const itemDex = getItemByID(item.item_number);
    const monsterDex = await findMonsterByID(monster.monster_id);

    const updateItem = await databaseClient<IItemsModel>(ItemsTable)
      .where({ id: monster.held_item })
      .update({ held_by: null });

    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ held_item: null });

    if (updateItem && updateMonster) {
      (interaction as CommandInteraction).reply(
        `Removed item **${itemDex.name.english}** from **${monsterDex.name.english}**.`,
      );
    }
  }
}

export async function checkItemEvolution(
  monster: IMonsterModel,
  interaction: CommandInteraction,
  isTrade = false,
): Promise<void> {
  const monster_dex: IMonsterDex = await findMonsterByID(monster.monster_id);

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
      evolve?.evoItem == item.name.english ||
      (evolve?.evoType == 'levelFriendship' && itemDB.item_number == 960) ||
      (evolve?.evoType == 'trade' && isTrade)
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
        const embed = new EmbedBuilder({
          color: evolve.color as unknown as number,
          description: `Nice! **${monster_dex.name.english}** has evolved into **${evolve.name.english}** with held item **${item.name.english}**!`,
          image: {
            url: imgs[0],
          },
          thumbnail: {
            url: imgs[1],
          },
          title: `${interaction.user.username}'s ${monster_dex.name.english} is evolving!`,
        });

        queueMsg(embed, interaction, false, 0, undefined, true);
      }
    }
  }
}

async function giveMonsterItem(interaction: CommandInteraction, args: string[]) {
  const user: IMonsterUserModel = await getUser(interaction.user.id);
  const split = args;
  let monster: IMonsterModel = undefined;

  if (user && split.length == 4) {
    const item = await getUserItemDB(parseInt(split[2]), interaction.user.id);

    if (split[3] == 'current') {
      monster = await getUserMonster(user.current_monster);
    } else {
      monster = await getUserMonster(split[3]);
    }

    if (!monster) {
      (interaction as CommandInteraction).reply(
        "That monster doesn't exist..",
      );
      return;
    }

    if (item && monster.uid == interaction.user.id && !monster.held_item) {
      if (item.item_number == 50 && monster.level < 100) {
        const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
          .where({ id: monster.id })
          .increment('level', 1);

        const deleteItem = await deleteItemDB(item.id);

        if (deleteItem && updateMonster) {
          const itemDex = getItemByID(item.item_number);
          const monsterDex = await findMonsterByID(monster.monster_id);
          (interaction as CommandInteraction).reply(
            `Gave **${monsterDex.name.english}** a **${itemDex.name.english}** and it leveled up! Neato!`,
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
          const monsterDex = await findMonsterByID(monster.monster_id);
          (interaction as CommandInteraction).reply(
            `Gave **${monsterDex.name.english}** an item - **${itemDex.name.english}**! Neato!`,
          );
          await checkItemEvolution(monster, interaction);
          return;
        }
      }
    }
  }
}

async function buyItem(interaction: CommandInteraction, args: string[]) {
  const user = await getUser(interaction.user.id);
  const split = args;

  if (user && split.length) {
    const item_to_buy =
      getItemByID(parseInt(split[split.length - 1])) ||
      getItemByName(split[split.length - 1]);

    if (item_to_buy && user.currency >= item_to_buy.price) {
      const create_item = await createItemDB({
        item_number: item_to_buy.id,
        uid: interaction.user.id,
      });

      if (create_item) {
        const updateUser = await databaseClient<IMonsterUserModel>(
          MonsterUserTable,
        )
          .where({ uid: interaction.user.id })
          .decrement('currency', item_to_buy.price);

        if (updateUser) {
          queueMsg(
            `You have purchased **${
              item_to_buy.name.english
            }** for **${format_number(
              item_to_buy.price,
            )}**! Remaining Balance: **${format_number(
              user.currency - item_to_buy.price,
            )}**.`,
            interaction,
            false,
            0,
            undefined,
            true,
          );
        }
      }
    }
  }
}

export async function msgBalance(interaction: CommandInteraction): Promise<void> {
  const user = await getUser(interaction.user.id);
  if (user) {
    (interaction as CommandInteraction).reply(
      `Your current balance is **${format_number(user.currency)}**.`,
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

export async function getItemDB(id: number | string): Promise<IItemsModel> {
  const item = await databaseClient<IItemsModel>(ItemsTable)
    .first()
    .where('id', id);
  return item;
}

async function getUserItemDB(id: number, uid: string): Promise<IItemsModel> {
  const item = await databaseClient<IItemsModel>(ItemsTable).first().where({
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

/*async function sellItemDB(
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
}*/

export async function createItemDB(data: IItemsModel): Promise<Array<number>> {
  const item = await databaseClient<IItemsModel>(ItemsTable).insert(data);
  return item;
}

async function getUserItems(uid: number | string): Promise<Array<IItemsModel>> {
  const items = await databaseClient<IItemsModel>(ItemsTable)
    .select()
    .where('uid', uid);
  return items;
}
