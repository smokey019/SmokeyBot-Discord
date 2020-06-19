import { getRndInteger } from '../../utils';
import PokeDex from './data/pokedex.json';
import { getLogger } from '../../clients/logger';
import { databaseClient } from '../../clients/database';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { Message } from 'discord.js';
import { MonsterUserTable, IMonsterUserModel } from '../../models/MonsterUser';

const logger = getLogger('Pokemon');

const MonsterPool: Array<IMonsterDex> = [];

export type IMonster = typeof PokeDex[0];

export interface IMonsterDex {
  id: number;
  name: {
    english: string;
    japanese: string;
    chinese: string;
    french: string;
  };
  baseSpecies?: string;
  baseForme?: string;
  forme?: string;
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
};

PokeDex.forEach((element) => {
  if (!element.forme) {
    MonsterPool.push(element);
  }

  if (element.id < 152) {
    Gens.one.push(element);
  }

  if (element.id < 252 && element.id > 151) {
    Gens.two.push(element);
  }

  if (element.id < 387 && element.id > 252) {
    Gens.three.push(element);
  }

  if (element.id < 494 && element.id > 386) {
    Gens.four.push(element);
  }

  if (element.id < 650 && element.id > 493) {
    Gens.five.push(element);
  }

  if (element.id < 722 && element.id > 649) {
    Gens.six.push(element);
  }

  if (element.id < 810 && element.id > 721) {
    Gens.seven.push(element);
  }

  if (element.id < 891 && element.id > 809) {
    Gens.eight.push(element);
  }
});

for (let index = 0; index < 75; index++) {
  MonsterPool.push(findMonsterByID(1));
  MonsterPool.push(findMonsterByID(2));
  MonsterPool.push(findMonsterByID(3));

  MonsterPool.push(findMonsterByID(4));
  MonsterPool.push(findMonsterByID(5));
  MonsterPool.push(findMonsterByID(6));

  MonsterPool.push(findMonsterByID(7));
  MonsterPool.push(findMonsterByID(8));
  MonsterPool.push(findMonsterByID(9));

  MonsterPool.push(findMonsterByID(746));
  MonsterPool.push(findMonsterByID(765));
  MonsterPool.push(findMonsterByID(745));

  MonsterPool.push(findMonsterByID(821));
  MonsterPool.push(findMonsterByID(822));
  MonsterPool.push(findMonsterByID(823));

  MonsterPool.push(findMonsterByID(861));
  MonsterPool.push(findMonsterByID(862));
  MonsterPool.push(findMonsterByID(866));

  MonsterPool.push(findMonsterByID(390));
  MonsterPool.push(findMonsterByID(391));
  MonsterPool.push(findMonsterByID(392));

  MonsterPool.push(findMonsterByID(479));
  MonsterPool.push(findMonsterByID(526));
  MonsterPool.push(findMonsterByID(565));

  MonsterPool.push(findMonsterByID(201));

  MonsterPool.push(findMonsterByID(258));
  MonsterPool.push(findMonsterByID(259));
  MonsterPool.push(findMonsterByID(260));

  MonsterPool.push(findMonsterByID(351));
  MonsterPool.push(findMonsterByID(352));
  MonsterPool.push(findMonsterByID(355));

  MonsterPool.push(findMonsterByID(94));
  MonsterPool.push(findMonsterByID(106));
  MonsterPool.push(findMonsterByID(107));

  MonsterPool.push(findMonsterByID(109));
  MonsterPool.push(findMonsterByID(112));
  MonsterPool.push(findMonsterByID(115));

  MonsterPool.push(findMonsterByID(122));
  MonsterPool.push(findMonsterByID(123));
  MonsterPool.push(findMonsterByID(124));

  MonsterPool.push(findMonsterByID(131));
  MonsterPool.push(findMonsterByID(137));
  MonsterPool.push(findMonsterByID(115));

  MonsterPool.push(findMonsterByID(17));
  MonsterPool.push(findMonsterByID(421));
  MonsterPool.push(findMonsterByID(24));
  MonsterPool.push(findMonsterByID(137));
  MonsterPool.push(findMonsterByID(163));
  MonsterPool.push(findMonsterByID(523));
  MonsterPool.push(findMonsterByID(574));
  MonsterPool.push(findMonsterByID(521));
  MonsterPool.push(findMonsterByID(353));
  MonsterPool.push(findMonsterByID(469));
  MonsterPool.push(findMonsterByID(317));
  MonsterPool.push(findMonsterByID(81));
  MonsterPool.push(findMonsterByID(764));
  MonsterPool.push(findMonsterByID(587));
  MonsterPool.push(findMonsterByID(409));
  MonsterPool.push(findMonsterByID(763));
  MonsterPool.push(findMonsterByID(85));
  MonsterPool.push(findMonsterByID(241));
  MonsterPool.push(findMonsterByID(253));
  MonsterPool.push(findMonsterByID(297));
  MonsterPool.push(findMonsterByID(214));
  MonsterPool.push(findMonsterByID(161));
  MonsterPool.push(findMonsterByID(269));
  MonsterPool.push(findMonsterByID(539));
  MonsterPool.push(findMonsterByID(817));
  MonsterPool.push(findMonsterByID(129));
  MonsterPool.push(findMonsterByID(472));
  MonsterPool.push(findMonsterByID(185));
  MonsterPool.push(findMonsterByID(886));
  MonsterPool.push(findMonsterByID(314));
  MonsterPool.push(findMonsterByID(16));
  MonsterPool.push(findMonsterByID(254));
  MonsterPool.push(findMonsterByID(692));
  MonsterPool.push(findMonsterByID(176));
  MonsterPool.push(findMonsterByID(462));
  MonsterPool.push(findMonsterByID(21));
  MonsterPool.push(findMonsterByID(387));
  MonsterPool.push(findMonsterByID(579));
  MonsterPool.push(findMonsterByID(63));
  MonsterPool.push(findMonsterByID(93));
  MonsterPool.push(findMonsterByID(140));
  MonsterPool.push(findMonsterByID(191));
  MonsterPool.push(findMonsterByID(325));
  MonsterPool.push(findMonsterByID(461));
  MonsterPool.push(findMonsterByID(366));
  MonsterPool.push(findMonsterByID(65));
  MonsterPool.push(findMonsterByID(84));
  MonsterPool.push(findMonsterByID(679));
  MonsterPool.push(findMonsterByID(678));
  MonsterPool.push(findMonsterByID(328));
  MonsterPool.push(findMonsterByID(352));
  MonsterPool.push(findMonsterByID(38));
  MonsterPool.push(findMonsterByID(159));
  MonsterPool.push(findMonsterByID(273));
  MonsterPool.push(findMonsterByID(877));
  MonsterPool.push(findMonsterByID(419));
  MonsterPool.push(findMonsterByID(860));
  MonsterPool.push(findMonsterByID(766));
  MonsterPool.push(findMonsterByID(362));
  MonsterPool.push(findMonsterByID(132));
  MonsterPool.push(findMonsterByID(838));
  MonsterPool.push(findMonsterByID(23));
  MonsterPool.push(findMonsterByID(11));
  MonsterPool.push(findMonsterByID(835));
  MonsterPool.push(findMonsterByID(88));
  MonsterPool.push(findMonsterByID(48));
  MonsterPool.push(findMonsterByID(519));
  MonsterPool.push(findMonsterByID(305));
  MonsterPool.push(findMonsterByID(626));
  MonsterPool.push(findMonsterByID(477));
  MonsterPool.push(findMonsterByID(557));
  MonsterPool.push(findMonsterByID(340));
  MonsterPool.push(findMonsterByID(451));
  MonsterPool.push(findMonsterByID(425));
  MonsterPool.push(findMonsterByID(544));
  MonsterPool.push(findMonsterByID(42));
  MonsterPool.push(findMonsterByID(602));
  MonsterPool.push(findMonsterByID(205));
  MonsterPool.push(findMonsterByID(312));
  MonsterPool.push(findMonsterByID(113));
  MonsterPool.push(findMonsterByID(262));
  MonsterPool.push(findMonsterByID(335));
  MonsterPool.push(findMonsterByID(709));
  MonsterPool.push(findMonsterByID(412));
  MonsterPool.push(findMonsterByID(324));
  MonsterPool.push(findMonsterByID(103));
  MonsterPool.push(findMonsterByID(100));
  MonsterPool.push(findMonsterByID(320));
  MonsterPool.push(findMonsterByID(219));
  MonsterPool.push(findMonsterByID(834));
  MonsterPool.push(findMonsterByID(207));
  MonsterPool.push(findMonsterByID(357));
  MonsterPool.push(findMonsterByID(414));
  MonsterPool.push(findMonsterByID(301));
  MonsterPool.push(findMonsterByID(596));
  MonsterPool.push(findMonsterByID(139));
  MonsterPool.push(findMonsterByID(102));
  MonsterPool.push(findMonsterByID(865));
  MonsterPool.push(findMonsterByID(400));
  MonsterPool.push(findMonsterByID(828));
  MonsterPool.push(findMonsterByID(467));
  MonsterPool.push(findMonsterByID(673));
  MonsterPool.push(findMonsterByID(83));
  MonsterPool.push(findMonsterByID(474));
  MonsterPool.push(findMonsterByID(175));
  MonsterPool.push(findMonsterByID(95));
}

export function getAllMonsters(): IMonsterDex[] {
  return MonsterPool;
}

export function getPokedex(): IMonsterDex[] {
  return PokeDex;
}

export function getMonsterByIndex(): IMonsterDex | undefined {
  return PokeDex[0];
}

export function getRandomMonster(): IMonsterDex {
  return MonsterPool[getRndInteger(0, MonsterPool.length - 1)];
}

export function findMonsterByID(id: number): any {
  for (let index = 0; index < PokeDex.length; index++) {
    if (PokeDex[index].id == id) {
      return PokeDex[index];
    }
  }
}

export async function findMonsterByName(name: string): Promise<any> {
  PokeDex.forEach(async (element) => {
    if (element.name.english?.toLowerCase() == name.toLowerCase()) {
      return element;
    }
  });

  /*for (let index = 0; index < PokeDex.length; index++) {
    console.log(typeof PokeDex[index].name);
    if (PokeDex[index].name.english.toString().toLowerCase() == name.toString().toLowerCase()){
      return PokeDex[index];
    }
  }*/
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

export async function selectMonster(message: Message): Promise<any> {
  const splitMsg = message.content.split(' ');

  const monster: IMonsterModel = await getUserMonster(splitMsg[1]);

  if (monster && message.author.id == monster.uid) {
    const updateUser = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: message.author.id })
      .update({ current_monster: parseInt(splitMsg[1]) });

    if (updateUser) {
      message.reply(`selected your new monster :)`);
    }
  }
}

export async function setFavorite(message: Message): Promise<any> {
  const splitMsg = message.content.split(' ');

  const monster: IMonsterModel = await getUserMonster(splitMsg[1]);

  if (monster && message.author.id == monster.uid) {
    const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', monster.id)
      .update({ favorite: 1 });

    if (updatedMonster) {
      message.reply(`favorited monster id ${monster.id}!`);
    }
  }
}

export async function unFavorite(message: Message): Promise<any> {
  const splitMsg = message.content.split(' ');

  const monster: IMonsterModel = await getUserMonster(splitMsg[1]);

  if (monster && message.author.id == monster.uid) {
    const updatedMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where('id', monster.id)
      .update({ favorite: 0 });

    if (updatedMonster) {
      message.reply(`unfavorited monster id ${monster.id}!`);
    }
  }
}

logger.info(`Total MonsterPool: ${getAllMonsters().length}.`);
logger.info(`Total Monsters: ${PokeDex.length}.`);
logger.info(`Random Monster: ${getRandomMonster().name.english}.`);
