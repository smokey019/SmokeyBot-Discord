import { getRndInteger } from '../../utils';
import PokeDex from './data/pokedex.json';
import { getLogger } from '../../clients/logger';
import { databaseClient } from '../../clients/database';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { Message, Collection } from 'discord.js';
import { MonsterUserTable, IMonsterUserModel } from '../../models/MonsterUser';
import {
	GenerationOne,
	GenerationTwo,
	GenerationThree,
	GenerationFour,
	GenerationFive,
	GenerationSix,
	GenerationSeven,
	GenerationEight,
} from './pokemon-list';

const logger = getLogger('Pokemon');

const MonsterPool: Array<number> = [];
const MonsterDex: Collection<number, IMonsterDex> = new Collection();

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
		element.id <= 893 &&
		!element.name.english.match(/Gmax/)
	) {
		MonsterDex.set(element.id, element);
	}
});

let mon = undefined;
for (let index = 0; index < 15; index++) {
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
		}
	});

	Gens.four.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.five.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.six.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.seven.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});

	Gens.eight.forEach((element) => {
		mon = findMonsterByID(element);
		if (mon) {
			MonsterPool.push(mon.id);
			MonsterPool.push(mon.id);
		}
	});
}

Gens.alola.forEach((element) => {
	for (let index = 0; index < 15; index++) {
		MonsterPool.push(element.id);
	}
});

Gens.galar.forEach((element) => {
	for (let index = 0; index < 15; index++) {
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
