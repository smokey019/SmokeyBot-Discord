import { Collection, Message } from 'discord.js';
import { CACHE_POKEDEX } from '../../clients/cache';
import { databaseClient } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { getRndInteger, jsonFetch } from '../../utils';
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
const sampleMonster = [
  {
    id: 1,
    name: {
      english: 'Bulbasaur',
      japanese: 'フシギダネ',
      chinese: '妙蛙种子',
      french: 'Bulbizarre',
    },
    type: ['Grass', 'Poison'],
    genderRatio: {
      M: 0.875,
      F: 0.125,
    },
    baseStats: {
      hp: 45,
      atk: 49,
      def: 49,
      spa: 65,
      spd: 65,
      spe: 45,
    },
    abilities: {
      '0': 'Overgrow',
      H: 'Chlorophyll',
    },
    heightm: 0.7,
    weightkg: 6.9,
    color: '#41c600',
    evos: ['Ivysaur'],
    eggGroups: ['Monster', 'Grass'],
    images: {
      normal:
        'https://cdn.discordapp.com/attachments/718781413452677211/812846012380479529/8140e2790dff77470f10b70c589ff6b3.png',
      shiny:
        'https://cdn.discordapp.com/attachments/718781413452677211/812846018034008084/139ddadd9fe23ac920d4cb87cd44ac30.png',
      gif:
        'https://cdn.discordapp.com/attachments/718781413452677211/812846024581316628/aee757d5f251d822a3a146396cd3137b.gif',
      'gif-shiny':
        'https://cdn.discordapp.com/attachments/718781413452677211/812846030587953182/2cd4223c3c5c1bd8942996a418e0cb22.gif',
    },
    forme: '',
    region: '',
    special: '',
    prevo: '',
    evoItem: '',
    otherFormes: [],
    evoType: '',
    evoLevel: 0,

    evoCondition: '',
    baseForme: '',
    formeOrder: [],
    gender: '',
    cosmeticFormes: [],
  },
];

const MonsterPool: Array<number> = [];
export const MonsterDex: Collection<number, IMonsterDex> = new Collection();

export type IMonsterDex = typeof sampleMonster[0];

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
  const PokeDex: Array<IMonsterDex> = await jsonFetch(
    'https://api.smokey.gg/pokemon/pokedex/all',
  );
  PokeDex.forEach(async (element) => {
    // !element.forme &&
    if (
      element.name &&
      element.type &&
      element.images &&
      element.images.normal &&
      !element.name.english.match(/Gmax/)
    ) {
      if (element.forme){
        if (element.forme != 'Mega') return;
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

  /*for (let index = 0; index < 100; index++) {
		MonsterPool.push(130);
		MonsterPool.push(133);
		MonsterPool.push(146);
		MonsterPool.push(197);
		MonsterPool.push(255);
		MonsterPool.push(325);
		MonsterPool.push(588);
		MonsterPool.push(717);
		MonsterPool.push(796);
		MonsterPool.push(894);
		MonsterPool.push(895);
	}*/

  for (let index = 0; index < 1; index++) {
    Gens.one.forEach((element) => {
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
      MonsterPool.push(element);
      MonsterPool.push(element);
    });
  }

  Gens.alola.forEach((element) => {
    for (let index = 0; index < 2; index++) {
      MonsterPool.push(element.id);
      MonsterPool.push(element.id);
    }
  });

  Gens.galar.forEach((element) => {
    for (let index = 0; index < 2; index++) {
      MonsterPool.push(element.id);
      MonsterPool.push(element.id);
    }
  });

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
export async function findMonsterByID(id: number): Promise<IMonsterDex> {
  let monster: IMonsterDex = await CACHE_POKEDEX.get(id.toString());
  if (!monster) {
    monster = await jsonFetch(`https://api.smokey.gg/pokemon/pokedex/${id}`);
    await CACHE_POKEDEX.set(id.toString(), monster);
    return monster;
  } else {
    return monster;
  }
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
  const dex = await findMonsterByID(monster.monster_id);

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
