import monsters from './data/pokedex.json';
import { getRndInteger } from '../../utils';

export type IMonster = typeof monsters[0];

const extras = 30;

for (let index = 0; index < extras; index++) {
  // bulba
  monsters.push(monsters[0]);
  // char
  monsters.push(monsters[3]);
  // squirtle
  monsters.push(monsters[6]);
  // pidgey
  monsters.push(monsters[15]);
  monsters.push(monsters[15]);
  // Pidgeotto
  monsters.push(monsters[16]);
  monsters.push(monsters[16]);
  // rattata
  monsters.push(monsters[18]);
  monsters.push(monsters[18]);
  monsters.push(monsters[18]);
  // spearow
  monsters.push(monsters[20]);
  // Ekans
  monsters.push(monsters[22]);
  // Pikachu
  monsters.push(monsters[24]);
  // Nidoran♀
  monsters.push(monsters[28]);
  monsters.push(monsters[28]);
  // Nidoran♂
  monsters.push(monsters[31]);
  monsters.push(monsters[31]);
  // Arcanine
  monsters.push(monsters[58]);
  // Poliwag
  monsters.push(monsters[59]);
  // Magikarp
  monsters.push(monsters[128]);
  monsters.push(monsters[128]);
  // Eevee
  monsters.push(monsters[132]);
  monsters.push(monsters[132]);
  // Chikorita
  monsters.push(monsters[151]);
  // Cyndaquil
  monsters.push(monsters[154]);
  // Totodile
  monsters.push(monsters[157]);
  // Sentret
  monsters.push(monsters[160]);
  monsters.push(monsters[160]);
  // Hoothoot
  monsters.push(monsters[162]);
  // Poochyena
  monsters.push(monsters[260]);
  monsters.push(monsters[260]);
  // Zigzagoon
  monsters.push(monsters[262]);
  monsters.push(monsters[262]);
  monsters.push(monsters[262]);
  // Wurmple
  monsters.push(monsters[264]);
  monsters.push(monsters[264]);
  // Turtwig
  monsters.push(monsters[386]);
  monsters.push(monsters[386]);
  // Buneary
  monsters.push(monsters[426]);
  monsters.push(monsters[426]);
  // Seismitoad
  monsters.push(monsters[536]);
  monsters.push(monsters[536]);
  // Krokorok
  monsters.push(monsters[552]);
  monsters.push(monsters[552]);
  // Gothita
  monsters.push(monsters[573]);
  // Voltorb
  monsters.push(monsters[99]);
  monsters.push(monsters[99]);
  // Krabby
  monsters.push(monsters[97]);
  // Machop
  monsters.push(monsters[65]);
  monsters.push(monsters[65]);
  // Ledyba
  monsters.push(monsters[164]);
  monsters.push(monsters[164]);
  // Vulpix
  monsters.push(monsters[36]);
  monsters.push(monsters[36]);
  // Ninetails
  monsters.push(monsters[37]);
  // Swablu
  monsters.push(monsters[332]);
  monsters.push(monsters[332]);
  // Abra
  monsters.push(monsters[62]);
  monsters.push(monsters[62]);
  // Mareep
  monsters.push(monsters[178]);
  monsters.push(monsters[178]);
  // Jynx
  monsters.push(monsters[123]);
  // Oddish
  monsters.push(monsters[42]);
  // Heracross
  monsters.push(monsters[213]);
  // Gastly
  monsters.push(monsters[92]);
  monsters.push(monsters[92]);
  monsters.push(monsters[92]);
  // Bellsprout
  monsters.push(monsters[68]);
  // Machamp
  monsters.push(monsters[67]);
  monsters.push(monsters[67]);
  // Geodude
  monsters.push(monsters[73]);
  monsters.push(monsters[73]);
  // Munchlax
  monsters.push(monsters[445]);
}

export function getAllMonsters(): IMonster[] {
  return monsters;
}

export function getMonsterByIndex(): IMonster | undefined {
  return monsters[0];
}

export function getRandomMonster(): IMonster {
  return monsters[getRndInteger(0, monsters.length - 1)];
}
