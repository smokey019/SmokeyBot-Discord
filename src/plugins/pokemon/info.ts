import { Message, MessageEmbed } from 'discord.js';

import { format_number, explode } from '../../utils';
//import { getLogger } from '../../clients/logger';
import { findMonsterByID, findMonsterByName } from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import {
  databaseClient,
  IUserSettings,
  UserSettingsTable,
  getMonsterUser,
} from '../../clients/database';
import { img_monster_ball } from './utils';
import { IMonsterUserModel } from '../../models/MonsterUser';

//const logger = getLogger('Pokemon-Info');

export async function monsterEmbed(
  monster_db: IMonsterModel,
  message: Message,
): Promise<any> {
  if (!monster_db) {
    return;
  }

  const monster = findMonsterByID(monster_db.monster_id);

  const monster_types = monster.type.join(' | ');

  const tmpID = `${monster.id}`.padStart(3, '0');

  const monster_nature = monster_db.nature;

  const next_level_xp = monster_db.level * 1250 + 1250;

  const monster_stats = {
    hp: Math.round(
      2 * monster.baseStats.hp +
        (monster_db.hp * monster_db.level) / 100 +
        monster_db.level +
        10,
    ),
    attack: Math.round(
      2 * monster.baseStats.atk +
        (monster_db.attack * monster_db.level) / 100 +
        5,
    ),
    defense: Math.round(
      2 * monster.baseStats.def +
        (monster_db.defense * monster_db.level) / 100 +
        5,
    ),
    sp_attack: Math.round(
      2 * monster.baseStats.spa +
        (monster_db.sp_attack * monster_db.level) / 100 +
        5,
    ),
    sp_defense: Math.round(
      2 * monster.baseStats.spd +
        (monster_db.sp_defense * monster_db.level) / 100 +
        5,
    ),
    speed: Math.round(
      2 * monster.baseStats.spe +
        (monster_db.speed * monster_db.level) / 100 +
        5,
    ),
  };

  const iv_avg =
    ((monster_db.hp +
      monster_db.attack +
      monster_db.defense +
      monster_db.sp_attack +
      monster_db.sp_defense +
      monster_db.speed) /
      186) *
    100;

  let favorite = ``;

  if (monster_db.favorite) {
    favorite = ' 💟';
  }

  if (monster_db.shiny) {
    const img = monster.images.shiny;
    const embed = new MessageEmbed()
      .setAuthor(
        `Level ${monster_db.level} ${monster.name.english} ⭐${favorite}`,
        img_monster_ball,
        `https://pokemondb.net/pokedex/${monster.id}`,
      )
      .setColor(0xf1912b)
      .setImage(img)
      .setThumbnail(
        `https://bot.smokey.gg/pokemon/images/gif/${tmpID}_shiny.gif`,
      ).setDescription(`⭐ __**SHINY**__ ⭐\n
    **National №**: ${tmpID}
    **ID**: ${monster_db.id}
    **Exp**: ${format_number(monster_db.experience)} / ${format_number(
      next_level_xp,
    )}
    **Type**: ${monster_types}
    **Nature**: ${monster_nature}
    **HP**: ${monster_stats.hp} - IV: ${monster_db.hp}/31
    **Attack**: ${monster_stats.attack} - IV: ${monster_db.attack}/31
    **Defense**: ${monster_stats.defense} - IV: ${monster_db.defense}/31
    **Sp. Atk**: ${monster_stats.sp_attack} - IV: ${monster_db.sp_attack}/31
    **Sp. Def**: ${monster_stats.sp_defense} - IV: ${monster_db.sp_defense}/31
    **Speed**: ${monster_stats.speed} - IV: ${monster_db.speed}/31\n
    **Total IV %**: ${iv_avg.toFixed(2)}%`);
    await message.channel
      .send(embed)
      .then((message) => {
        return message;
      })
      .catch(console.error);
  } else if (!monster.forme && !monster_db.shiny) {
    const img = monster.images.normal;
    const embed = new MessageEmbed()
      .setAuthor(
        `Level ${monster_db.level} ${monster.name.english}${favorite}`,
        img_monster_ball,
        `https://pokemondb.net/pokedex/${monster.id}`,
      )
      .setColor(0xff0000)
      .setThumbnail(`https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`)
      .setImage(img).setDescription(`**ID**: ${monster_db.id}
    **National №**: ${tmpID}
    **Exp**: ${format_number(monster_db.experience)} / ${format_number(
      next_level_xp,
    )}
    **Type**: ${monster_types}
    **Nature**: ${monster_nature}
    **HP**: ${monster_stats.hp} - IV: ${monster_db.hp}/31
    **Attack**: ${monster_stats.attack} - IV: ${monster_db.attack}/31
    **Defense**: ${monster_stats.defense} - IV: ${monster_db.defense}/31
    **Sp. Atk**: ${monster_stats.sp_attack} - IV: ${monster_db.sp_attack}/31
    **Sp. Def**: ${monster_stats.sp_defense} - IV: ${monster_db.sp_defense}/31
    **Speed**: ${monster_stats.speed} - IV: ${monster_db.speed}/31\n
    **Total IV %**: ${iv_avg.toFixed(2)}%`);
    await message.channel
      .send(embed)
      .then((message) => {
        return message;
      })
      .catch(console.error);
  }
}

/**
 * Get latest Monster caught's information.
 * @param message
 */
export async function monsterInfoLatest(message: Message): Promise<void> {
  const user = await databaseClient<IUserSettings>(UserSettingsTable)
    .select()
    .where('uid', message.author.id);

  if (user) {
    if (user[0].latest_monster) {
      const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .where('id', user[0].latest_monster);

      if (!tmpMonster) return;

      monsterEmbed(tmpMonster[0], message);
    }
  }
}

/**
 * Get a specific Monster's information.
 * @param id
 */
export async function monsterInfo(message: Message): Promise<void> {
  const tmpSplit = message.content.split(' ');

  if (tmpSplit.length == 2) {
    const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where('id', tmpSplit[1]);

    if (!tmpMonster) return;

    monsterEmbed(tmpMonster[0], message);
  }
}

/**
 * Get a specific Monster's information.
 * @param id
 */
export async function currentMonsterInfo(message: Message): Promise<void> {
  const user: IMonsterUserModel = await getMonsterUser(message.author.id);

  if (!user) return;

  const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where('id', user.current_monster);

  if (!tmpMonster) return;

  monsterEmbed(tmpMonster[0], message);
}

/**
 * Get a specific Monster's information.
 * @param id
 */
export async function monsterDex(message: Message): Promise<void> {
  const tmpSplit = explode(message.content, ' ', 3);

  const tempMonster = await findMonsterByName(tmpSplit[1].toLowerCase());

  if (tempMonster) {
    const monster_types = tempMonster.type.join(' | ');

    const tmpID = `${tempMonster.id}`.padStart(3, '0');

    const monster_stats = {
      hp: tempMonster.baseStats.hp,
      attack: tempMonster.baseStats.atk,
      defense: tempMonster.baseStats.def,
      sp_attack: tempMonster.baseStats.spa,
      sp_defense: tempMonster.baseStats.spd,
      speed: tempMonster.baseStats.spe,
    };

    let thumbnail = ``;
    let image = ``;

    if (tempMonster.region || tempMonster.forme) {
      // shiny
      if (tmpSplit[2] == '--shiny') {
        thumbnail = tempMonster.images['gif-shiny'];
        image = tempMonster.images.shiny;
      } else {
        // not shiny
        thumbnail = tempMonster.images.gif;
        image = tempMonster.images.normal;
      }
    } else {
      // shiny
      if (tmpSplit[2] == '--shiny') {
        thumbnail = `https://bot.smokey.gg/pokemon/images/gif/${tmpID}_shiny.gif`;
        image = tempMonster.images.shiny;
      } else {
        // not shiny
        thumbnail = `https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`;
        image = tempMonster.images.normal;
      }
    }

    const embed = new MessageEmbed()
      .setAuthor(
        '#' + tmpID + ' - ' + tempMonster.name.english,
        img_monster_ball,
        `https://pokemondb.net/pokedex/${tempMonster.id}`,
      )
      .setColor(0x12bca4)
      .setThumbnail(thumbnail)
      .setImage(image).setDescription(`**Type(s)**: ${monster_types}

      **National №**: ${tmpID}

    **Base Stats**

    **HP**: ${monster_stats.hp}
    **Attack**: ${monster_stats.attack}
    **Defense**: ${monster_stats.defense}
    **Sp. Atk**: ${monster_stats.sp_attack}
    **Sp. Def**: ${monster_stats.sp_defense}
    **Speed**: ${monster_stats.speed}`);
    await message.channel
      .send(embed)
      .then((message) => {
        return message;
      })
      .catch(console.error);
  }
}

export async function userDex(message: Message): Promise<Array<any>> {
  const dex = [];

  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      uid: message.author.id,
    });

  if (pokemon.length > 0) {
    pokemon.forEach((element) => {
      if (!dex.includes(element.monster_id)) {
        dex.push(element.monster_id);
      }
    });
  }

  return dex;
}
