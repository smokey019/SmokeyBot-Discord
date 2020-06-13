import monsters from './data/pokedex.json';
import { getRndInteger } from '../../utils';

export type IMonster = typeof monsters[0];

const extras = 60;
const originalMonsters = monsters;
const Gens = {
  one: [],
  two: [],
  three: [],
  four: [],
  five: [],
  six: [],
  seven: [],
};

for (let index = 0; index < 150; index++) {
  Gens.one.push(monsters[index]);
}

for (let index = 151; index < 250; index++) {
  Gens.two.push(monsters[index]);
}

for (let index = 251; index < 385; index++) {
  Gens.three.push(monsters[index]);
}

for (let index = 386; index < 492; index++) {
  Gens.four.push(monsters[index]);
}

for (let index = 493; index < 648; index++) {
  Gens.five.push(monsters[index]);
}

for (let index = 649; index < 720; index++) {
  Gens.six.push(monsters[index]);
}

for (let index = 721; index < 806; index++) {
  Gens.seven.push(monsters[index]);
}

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
  // Krokorok
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
  // Geodude
  monsters.push(monsters[73]);
  monsters.push(monsters[73]);
  // Munchlax
  monsters.push(monsters[445]);
  // Chatot
  monsters.push(monsters[440]);
  // Klink
  monsters.push(monsters[598]);
  // Eelektrik
  monsters.push(monsters[602]);
  // Pancham
  monsters.push(monsters[673]);
  // Aurorus
  monsters.push(monsters[698]);
  // Kabutops
  monsters.push(monsters[140]);
  // Gothita
  monsters.push(monsters[573]);
  // Arrokuda
  monsters.push(monsters[845]);
  // Exeggcute
  monsters.push(monsters[101]);
  // Minun
  monsters.push(monsters[311]);
  // Electivire
  monsters.push(monsters[465]);
  // Dragonair
  monsters.push(monsters[147]);
  // Dusknoir
  monsters.push(monsters[476]);
  // Elekid
  monsters.push(monsters[238]);
  // Drakloak
  monsters.push(monsters[885]);
  // Surskit
  monsters.push(monsters[282]);
  // Victreebel
  monsters.push(monsters[70]);
  // Dewgong
  monsters.push(monsters[86]);
  monsters.push(monsters[86]);
  monsters.push(monsters[86]);
  // Galvantula
  monsters.push(monsters[595]);
  // Tropius
  monsters.push(monsters[356]);
  // Farfetch'd
  monsters.push(monsters[82]);
  // Rolycoly
  monsters.push(monsters[836]);
  // Aggron
  monsters.push(monsters[305]);
  // Salazzle
  monsters.push(monsters[757]);
  // Doduo
  monsters.push(monsters[83]);
  monsters.push(monsters[83]);
  monsters.push(monsters[83]);
  // Diglett
  monsters.push(monsters[49]);
  monsters.push(monsters[49]);
  monsters.push(monsters[49]);
  // Corviknight
  monsters.push(monsters[822]);
  // Carkol
  monsters.push(monsters[837]);
  // Chewtle
  monsters.push(monsters[832]);
  // Drednaw
  monsters.push(monsters[833]);
  // Skwovet
  monsters.push(monsters[818]);
  // Salandit
  monsters.push(monsters[756]);
  monsters.push(monsters[756]);
  // Avalugg
  monsters.push(monsters[712]);
  // Heliolisk
  monsters.push(monsters[694]);
  // Espurr
  monsters.push(monsters[676]);
  // Ferroseed
  monsters.push(monsters[596]);
  // Tirtouga
  monsters.push(monsters[563]);
  // Boldore
  monsters.push(monsters[524]);
  // Gigalith
  monsters.push(monsters[525]);
  // Riolu
  monsters.push(monsters[446]);
  // Shinx
  monsters.push(monsters[402]);
  // Luxio
  monsters.push(monsters[403]);
  // Luxray
  monsters.push(monsters[404]);
  // Unown
  monsters.push(monsters[200]);
  // Ampharos
  monsters.push(monsters[180]);
  // Togepi
  monsters.push(monsters[174]);
  // Tangela
  monsters.push(monsters[113]);
  // Grimer
  monsters.push(monsters[87]);
  // Charizard
  monsters.push(monsters[5]);
}

console.log(`Monsters length: ${monsters.length}.`);

export function getAllMonsters(): IMonster[] {
  return monsters;
}

export function getPokedex(): IMonster[] {
  return originalMonsters;
}

export function getMonsterByIndex(): IMonster | undefined {
  return monsters[0];
}

export function getRandomMonster(): IMonster {
  return monsters[getRndInteger(0, monsters.length - 1)];
}
