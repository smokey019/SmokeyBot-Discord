import { Collection, Message } from 'discord.js';
import { databaseClient } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { getRndInteger, jsonFetch } from '../../utils';
import PokeDex from './data/pokedex.json';
import {
  GenerationEight,
  GenerationFive,
  GenerationFour,
  GenerationOne,
  GenerationSeven,
  GenerationSix,
  GenerationThree,
  GenerationTwo,
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

async function formDex(): Promise<void> {
  logger.info('Forming Pokedex..');
  PokeDex.forEach(async (element) => {
    // !element.forme &&
    if (
      element.name &&
      element.type &&
      element.images &&
      element.images.normal &&
      !element.name.english.match(/Gmax/)
    ) {
      if (element.forme) {
        if (!element.forme.match('Mega')) return;
      }
      MonsterPool.push(element.id);
      if (element.region == 'Alola') {
        Gens.alola.push(element);
      }
      if (element.region == 'Galar') {
        Gens.galar.push(element);
      }
    }
    if (
      element.name.english &&
      element.images &&
      element.images.normal &&
      !element.name.english.match(/Gmax/)
    ) {
      MonsterDex.set(element.id, element);

      /*await databaseClient('pokedex').insert({
				pokemon_id: element.id || null,
				name: JSON.stringify(element.name) || null,
				type: JSON.stringify(element.type) || null,
				genderRatio: JSON.stringify(element.genderRatio) || null,
				baseStats: JSON.stringify(element.baseStats) || null,
				abilities: JSON.stringify(element.abilities) || null,
				heightm: element.heightm || null,
				weightkg: element.weightkg || null,
				color: element.color || null,
				evos: JSON.stringify(element.evos) || null,
				eggGroups: JSON.stringify(element.eggGroups) || null,
				images: JSON.stringify(element.images) || null,
				forme: element.forme || null,
				region: element.region || null,
				special: element.special || null,
				prevo: element.prevo || null,
				evoItem: element.evoItem || null,
				evoType: element.evoType || null,
				evoLevel: element.evoLevel || null,
				evoCondition: element.evoCondition || null,
				otherFormes: JSON.stringify(element.otherFormes) || null,
				baseForme: element.baseForme || null,
				formeOrder: JSON.stringify(element.formeOrder) || null,
				gender: element.gender || null,
				cosmeticFormes: JSON.stringify(element.cosmeticFormes) || null,
			});*/
    }
  });

  /**
   * Specific Monster Boosts
   */

  /*for (let index = 0; index < 150; index++) {
    MonsterPool.push(92);
    MonsterPool.push(193);
    MonsterPool.push(66);
  }*/

  for (let index = 0; index < 2; index++) {
    Gens.one.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.two.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.three.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.four.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.five.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.six.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.seven.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.eight.forEach((element) => {
      MonsterPool.push(element);
      MonsterPool.push(element);
    });

    Gens.alola.forEach((element) => {
      MonsterPool.push(element.id);
      MonsterPool.push(element.id);
    });

    Gens.galar.forEach((element) => {
      MonsterPool.push(element.id);
      MonsterPool.push(element.id);
    });
  }

  /**
   * clear to save some memory
   */
  Gens = undefined;

  logger.info('Finished forming Pokedex.');
}

/**
 * have to do this inside of a function :)
 */

formDex();

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
export async function findMonsterByID_DB(id: number): Promise<IMonsterDex> {
  return await jsonFetch(`https://api.smokey.gg/pokemon/pokedex/${id}`);
}

/**
 * get monster's dex info by it's number
 * @param id monster number
 */
export async function findMonsterByID(id: number): Promise<IMonsterDex> {
  const monster = MonsterDex.find((mon) => mon.id === id);
  return monster;
}

export function findMonsterByIDLocal(id: number): IMonsterDex {
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
  const dex = await findMonsterByID(monster.monster_id);

  if (monster && message.author.id == monster.uid) {
    const updateUser = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: message.author.id })
      .update({ current_monster: parseInt(splitMsg[1]) });

    if (updateUser) {
      message.reply(`Selected **Level ${monster.level} ${dex.name.english}**!`);
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
  const dex = await findMonsterByID(monster.monster_id);

  if (monster && message.author.id == monster.uid) {
    const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', monster.id)
      .update({ favorite: 1 });

    if (updatedMonster) {
      message.reply(
        `Favorited monster **Level ${monster.level} ${dex.name.english}**!`,
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
      message.reply(`Unfavorited monster id ${monster.id}!`);
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}
