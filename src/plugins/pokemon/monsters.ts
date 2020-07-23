import { getRndInteger } from '../../utils';
import PokeDex from './data/pokedex.json';
import { getLogger } from '../../clients/logger';
import { databaseClient } from '../../clients/database';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { Message } from 'discord.js';
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

const MonsterPool: Array<IMonsterDex> = [];
const MonsterDex: Array<IMonsterDex> = [];

export type IMonsterDex = typeof PokeDex[0];

export interface IMonsterDexTest {
  id: number;
  name: {
    english: string;
    japanese: string;
    chinese: string;
    french: string;
  };
  baseSpecies?: string;
  special?: string;
  baseForme?: string;
  forme?: string;
  region?: string;
  type: Array<string>;
  gender?: string;
  genderRatio?: {
    M: number;
    F: number;
  };
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  };
  abilities?: any;
  heightm: number;
  weightkg: number;
  color: string;
  prevo?: string;
  evoType?: string;
  evoItem?: string;
  evoMove?: string;
  evos?: Array<string>;
  evoLevel?: number;
  eggGroups?: Array<string>;
  images?: {
    normal: string;
    shiny: string;
    gif: string;
    'gif-shiny': string;
  };
  otherFormes?: Array<string>;
  formeOrder?: Array<string>;
  requiredItem?: string;
  isGigantamax?: string;
}

const Gens = {
  one: [],
  two: [],
  three: [],
  four: [],
  five: [],
  six: [],
  seven: [],
  eight: [],
  galar: [],
  alola: [],
};

Gens.one = GenerationOne;
Gens.two = GenerationTwo;
Gens.three = GenerationThree;
Gens.four = GenerationFour;
Gens.five = GenerationFive;
Gens.six = GenerationSix;
Gens.seven = GenerationSeven;
Gens.eight = GenerationEight;

PokeDex.forEach((element) => {
  if (!element.forme) {
    MonsterPool.push(element);
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
    element.id <= 893
  ) {
    MonsterDex.push(element);
  }
});
let mon = undefined;
for (let index = 0; index < 75; index++) {
  Gens.one.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
      MonsterPool.push(mon);
      if (mon.id == 68 || mon.id == 4) {
        for (let z = 0; z < 50; z++) {
          MonsterPool.push(mon);
        }
      }
    }
  });

  Gens.two.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
      MonsterPool.push(mon);
    }
  });

  Gens.three.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
    }
  });

  Gens.four.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
    }
  });

  Gens.five.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
    }
  });

  Gens.six.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
    }
  });

  Gens.seven.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
    }
  });

  Gens.eight.forEach((element) => {
    mon = findMonsterByID(element);
    if (mon) {
      MonsterPool.push(mon);
      MonsterPool.push(mon);
    }
  });
}

Gens.alola.forEach((element) => {
  for (let index = 0; index < 65; index++) {
    MonsterPool.push(element);
  }
});

Gens.galar.forEach((element) => {
  for (let index = 0; index < 65; index++) {
    MonsterPool.push(element);
  }
});

export function getAllMonsters(): IMonsterDex[] {
  return MonsterPool;
}

export function getPokedex(): IMonsterDex[] {
  return MonsterDex;
}

export function getMonsterByIndex(): IMonsterDex {
  return MonsterDex[0];
}

export function getRandomMonster(): IMonsterDex {
  return MonsterPool[getRndInteger(0, MonsterPool.length - 1)];
}

export function findMonsterByID(id: number): IMonsterDex {
  let monster = undefined;
  for (let index = 0; index < MonsterDex.length; index++) {
    if (MonsterDex[index].id == id) {
      monster = MonsterDex[index];
    }
  }
  return monster;
}

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
logger.info(`Total Monsters: ${MonsterDex.length}.`);
logger.info(`Random Monster: ${getRandomMonster().name.english}.`);
