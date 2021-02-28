import { Collection, Message } from 'discord.js';
import { databaseClient } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { getRndInteger } from '../../utils';
import PokeDex from './data/pokedex.json';
import {
	GenerationEight,
	GenerationFive,
	GenerationFour,
	GenerationOne,
	GenerationSeven,
	GenerationSix,
	GenerationThree,
	GenerationTwo
} from './pokemon-list';

const logger = getLogger('Pokemon');

const MonsterPool: Array<number> = [];
export const MonsterDex: Collection<number, IMonsterDex> = new Collection();

export type IMonsterDex = typeof PokeDex[0];

let Gens = {
	one: GenerationOne,
	two: GenerationTwo,
	three: GenerationThree,
	four: GenerationFour,
	five: GenerationFive,
	six: GenerationSix,
	seven: GenerationSeven,
	eight: GenerationEight,
	galar: [],
	alola: [],
};

PokeDex.forEach((element) => {
	if (!element.forme) {
		MonsterPool.push(element.id);
	}
	if (element.region == 'Alola') {
		Gens.alola.push(element);
	}
	if (element.region == 'Galar') {
		Gens.galar.push(element);
	}
	if (
		element.name.english &&
		element.images &&
		element.id >= 0 &&
		element.id <= 898 &&
		!element.name.english.match(/Gmax/)
	) {
		MonsterDex.set(element.id, element);
	}
});

for (let index = 0; index < 500; index++) {
  let monster = findMonsterByID(130);
  MonsterPool.push(monster.id);
  monster = findMonsterByID(588);
  MonsterPool.push(monster.id);
  monster = findMonsterByID(796);
  MonsterPool.push(monster.id);
  monster = findMonsterByID(895);
  MonsterPool.push(monster.id);
  MonsterPool.push(monster.id);
  monster = findMonsterByID(717);
  MonsterPool.push(monster.id);
}

let mon = undefined;
for (let index = 0; index < 3; index++) {
	Gens.one.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.two.forEach((element) => {
    mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.three.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.four.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.five.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.six.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.seven.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.eight.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});
}

Gens.alola.forEach((element) => {
	for (let index = 0; index < 3; index++) {
		MonsterPool.push(element.id);
	}
});

Gens.galar.forEach((element) => {
	for (let index = 0; index < 3; index++) {
		MonsterPool.push(element.id);
	}
});

/**
 * clear to save some memory
 */
Gens = undefined;

/**
 * return monster spawn pool
 */
export function getAllMonsters(): number[] {
	return MonsterPool;
}

/**
 * return pokedex Collection
 */
export function getPokedex(): Collection<number, IMonsterDex> {
	return MonsterDex;
}

/**
 * get a random monster from the spawn pool
 */
export function getRandomMonster(): number {
	return MonsterPool[getRndInteger(0, MonsterPool.length - 1)];
}

/**
 * get monster's dex info by it's number
 * @param id monster number
 */
export function findMonsterByID(id: number): IMonsterDex {
	return MonsterDex.get(id);
}

/**
 * find monster by it's name
 * @param name
 */
export function findMonsterByName(name: string): IMonsterDex {
	if (!name) return undefined;
	let monster = undefined;
	MonsterDex.forEach(async (element) => {
		if (
			element.name.english.toLowerCase().replace(/♂|♀/g, '') ==
			name.toLowerCase()
		) {
			monster = element;
		}
	});

	return monster;
}

/**
 * return total monster count for stats
 */
export async function getMonsterDBCount(): Promise<number> {
	const db_monster = await databaseClient<IMonsterModel>(MonsterTable).select(
		'id',
	);

	return db_monster.length;
}

/**
 * return total shiny monster count for stats
 */
export async function getShinyMonsterDBCount(): Promise<number> {
	const db_monster = await databaseClient<IMonsterModel>(MonsterTable)
		.select('id')
		.where('shiny', 1);

	return db_monster.length;
}

/**
 * return user's monster database info
 * @param monster_id database id
 */
export async function getUserMonster(
	monster_id: string | number,
): Promise<IMonsterModel> {
	const db_monster = await databaseClient<IMonsterModel>(MonsterTable)
		.select()
		.where('id', monster_id);

	if (db_monster) {
		return db_monster[0];
	} else {
		return undefined;
	}
}

export async function getUsersMonsters(uid: string): Promise<IMonsterModel[]> {
	const monsters = await databaseClient<IMonsterModel>(MonsterTable)
		.select()
		.where({
			uid: uid,
			released: 0,
		});
	return monsters;
}

export async function selectMonster(message: Message): Promise<boolean> {
	const splitMsg = message.content.split(' ');

	const monster: IMonsterModel = await getUserMonster(splitMsg[1]);
	if (!monster) return undefined;
	const dex = findMonsterByID(monster.monster_id);

	if (monster && message.author.id == monster.uid) {
		const updateUser = await databaseClient<IMonsterUserModel>(MonsterUserTable)
			.where({ uid: message.author.id })
			.update({ current_monster: parseInt(splitMsg[1]) });

		if (updateUser) {
			message.reply(`selected **Level ${monster.level} ${dex.name.english}**!`);
			return true;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

export async function setFavorite(message: Message): Promise<boolean> {
	const splitMsg = message.content.split(' ');

	const monster: IMonsterModel = await getUserMonster(splitMsg[1]);
	if (!monster) return undefined;
	const dex = findMonsterByID(monster.monster_id);

	if (monster && message.author.id == monster.uid) {
		const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
			.where('id', monster.id)
			.update({ favorite: 1 });

		if (updatedMonster) {
			message.reply(
				`favorited monster **Level ${monster.level} ${dex.name.english}**!`,
			);
			return true;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

export async function unFavorite(message: Message): Promise<boolean> {
	const splitMsg = message.content.split(' ');

	const monster: IMonsterModel = await getUserMonster(splitMsg[1]);

	if (monster && message.author.id == monster.uid) {
		const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
			.where('id', monster.id)
			.update({ favorite: 0 });

		if (updatedMonster) {
			message.reply(`unfavorited monster id ${monster.id}!`);
			return true;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

logger.info(`Total MonsterPool: ${getAllMonsters().length}.`);
logger.info(`Total Monsters: ${MonsterDex.size}.`);
logger.info(
	`Random Monster: ${findMonsterByID(getRandomMonster()).name.english}.`,
);
