import { Message, MessageEmbed } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { COLOR_BLUE } from '../../colors';
import { IItemsModel, ItemsTable } from '../../models/Items';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { asyncForEach, chunk, explode, format_number } from '../../utils';
import Items from './data/items.json';
import {
    findMonsterByID,
    findMonsterByName,
    getUserMonster,
    IMonsterDex
} from './monsters';
// import MultiMap from 'mnemonist/multi-map';
import { default_prefixes, GUILD_PREFIXES } from './parser';

const logger = getLogger('Items');

export type Iitem = typeof Items[1];

export const itemDB = Items;

export async function parseItems(message: Message): Promise<void> {
	const load_prefixes =
		(await GUILD_PREFIXES.get(message.guild.id)) || default_prefixes;
	const prefixes = RegExp(load_prefixes.join('|'));
	const detect_prefix = message.content.match(prefixes);
	const prefix = detect_prefix.shift();
	const args = message.content
		.slice(prefix.length)
		.trim()
		.toLowerCase()
		.replace(/ {2,}/gm, ' ')
		.split(/ +/);
	const command = args[1];

	if (command == 'buy') {
		await buyItem(message);
	} else if (command == 'remove' || command == '-') {
		await removeMonsterItem(message);
	} else if (command == 'balance') {
		await msgBalance(message);
	} else if (command == 'give' || command == '+') {
		await giveMonsterItem(message);
	} else if (command == 'list' || command == 'items' || command == '=') {
		await msgUserItems(message);
	} else if (command == 'shop') {
		await listItems(message);
	} else if (command == 'update') {
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
		.catch((err) => {
			logger.error(err);
		});
}

async function msgUserItems(message: Message): Promise<any> {
	const isQuote = message.content.match('"');
	const sort = ['id', 'high'];
	let search = undefined;
	let page = 0;

	const load_prefixes =
		(await GUILD_PREFIXES.get(message.guild.id)) || default_prefixes;
	const prefixes = RegExp(load_prefixes.join('|'));
	const detect_prefix = message.content.match(prefixes);
	const prefix = detect_prefix.shift();
	const args = message.content
		.slice(prefix.length)
		.trim()
		.toLowerCase()
		.replace(/ {2,}/gm, ' ')
		.split(/ +/);

	args.splice(0, 2);

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
	const items = await getUserItems(message.author.id);

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

		const embed = new MessageEmbed()
			.setAuthor(
				`${message.author.username}'s search for '${search}' \nFound: ${sortable_items.length} \nTotal Items: ${items.length}`,
				`https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png`,
			)
			.setColor(COLOR_BLUE)
			.setDescription(new_msg);
		await message.channel
			.send(embed)
			.then((message) => {
				return message;
			})
			.catch((err) => {
				logger.error(err);
			});
	}
}

async function updateItems(message: Message): Promise<boolean> {
	const user = await getUser(message.author.id);
	const items = JSON.parse(user.items);

	if (items.length > 0) {
		items.forEach(async (element) => {
			await databaseClient<IItemsModel>(ItemsTable).insert({
				item_number: element,
				uid: message.author.id,
			});
		});
		await databaseClient<IMonsterUserModel>(MonsterUserTable)
			.update('items', '[]')
			.where('uid', message.author.id);

		const newItems = await getUserItems(message.author.id);
		message.reply(
			`successfully transferred ${newItems.length} to the new item inventory!`,
		);
		return true;
	} else {
		message.reply(`you don't have any old items!`);
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
					.catch((err) => {
						logger.error(err);
					});
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
					const monsterDex = await findMonsterByID(monster.monster_id);
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
					const monsterDex = await findMonsterByID(monster.monster_id);
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
			getItemByID(parseInt(split[split.length - 1])) ||
			getItemByName(split[split.length - 1]);

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

export async function getItemDB(id: number | string): Promise<IItemsModel> {
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
