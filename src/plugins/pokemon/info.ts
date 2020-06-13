import { Message, MessageEmbed } from 'discord.js';

import { format_number } from '../../utils';
// import { getLogger } from '../../clients/logger';
import { getAllMonsters, getPokedex } from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import {
  databaseClient,
  IUserSettings,
  UserSettingsTable,
} from '../../clients/database';
import { img_monster_ball } from './utils';

// const logger = getLogger('Pokemon');

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

      const monsters = getAllMonsters();

      const monster = monsters[tmpMonster[0].monster_id - 1];

      const monster_types = monster.type.join(' | ');

      const tmpID = `${monster.id}`.padStart(3, '0');

      const monster_nature = tmpMonster[0].nature;

      const monster_stats = {
        hp: Math.round(
          2 * monster.base.HP +
            (tmpMonster[0].hp * tmpMonster[0].level) / 100 +
            tmpMonster[0].level +
            10,
        ),
        attack: Math.round(
          2 * monster.base.Attack +
            (tmpMonster[0].attack * tmpMonster[0].level) / 100 +
            5,
        ),
        defense: Math.round(
          2 * monster.base.Defense +
            (tmpMonster[0].defense * tmpMonster[0].level) / 100 +
            5,
        ),
        sp_attack: Math.round(
          2 * monster.base['Sp. Attack'] +
            (tmpMonster[0].sp_attack * tmpMonster[0].level) / 100 +
            5,
        ),
        sp_defense: Math.round(
          2 * monster.base['Sp. Defense'] +
            (tmpMonster[0].sp_defense * tmpMonster[0].level) / 100 +
            5,
        ),
        speed: Math.round(
          2 * monster.base.Speed +
            (tmpMonster[0].speed * tmpMonster[0].level) / 100 +
            5,
        ),
      };

      const iv_avg =
        ((tmpMonster[0].hp +
          tmpMonster[0].attack +
          tmpMonster[0].defense +
          tmpMonster[0].sp_attack +
          tmpMonster[0].sp_defense +
          tmpMonster[0].speed) /
          186) *
        100;

      if (tmpMonster[0].shiny) {
        const embed = new MessageEmbed()
          /*.setTitle(
            `**Level ${tmpMonster[0].level} ${monster.name.english} <:star:719087649536606208>**`,
          )*/
          .setAuthor(
            `Level ${tmpMonster[0].level} ${monster.name.english} *SHINY`,
            img_monster_ball,
            `https://bulbapedia.bulbagarden.net/wiki/${monster.name.english}_(Pokémon)`,
          )
          .setColor(0xf1912b)
          .setImage(
            `https://bot.smokey.gg/pokemon/images/gif/${tmpID}_shiny.gif`,
          )
          // .setImage(`https://www.serebii.net/Shiny/SWSH/${tmpID}.png`)
          // .setImage(`https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`)
          .setThumbnail(
            `https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`,
          )
          .setDescription(`<:star:719087649536606208> **SHINY** <:star:719087649536606208>\n
				**ID**: ${tmpMonster[0].id}
				**Exp**: ${format_number(tmpMonster[0].experience)}
				**Type**: ${monster_types}
				**Nature**: ${monster_nature}
				**HP**: ${monster_stats.hp} - IV: ${tmpMonster[0].hp}/31
				**Attack**: ${monster_stats.attack} - IV: ${tmpMonster[0].attack}/31
				**Defense**: ${monster_stats.defense} - IV: ${tmpMonster[0].defense}/31
				**Sp. Atk**: ${monster_stats.sp_attack} - IV: ${tmpMonster[0].sp_attack}/31
				**Sp. Def**: ${monster_stats.sp_defense} - IV: ${tmpMonster[0].sp_defense}/31
				**Speed**: ${monster_stats.speed} - IV: ${tmpMonster[0].speed}/31\n
				**Total IV %**: ${iv_avg.toFixed(2)}%`);
        await message.channel
          .send(embed)
          .then((message) => {
            return message;
          })
          .catch(console.error);
      } else {
        const embed = new MessageEmbed() // .setThumbnail(`https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`)
          // .setTitle(`**Level ${tmpMonster[0].level} ${monster.name.english}**`)
          .setAuthor(
            `Level ${tmpMonster[0].level} ${monster.name.english}`,
            img_monster_ball,
            `https://bulbapedia.bulbagarden.net/wiki/${monster.name.english}_(Pokémon)`,
          )
          .setColor(0xff0000)
          .setThumbnail(`https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`)
          .setImage(`https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`)
          .setDescription(`**ID**: ${tmpMonster[0].id}
				**Exp**: ${format_number(tmpMonster[0].experience)}
				**Type**: ${monster_types}
				**Nature**: ${monster_nature}
				**HP**: ${monster_stats.hp} - IV: ${tmpMonster[0].hp}/31
				**Attack**: ${monster_stats.attack} - IV: ${tmpMonster[0].attack}/31
				**Defense**: ${monster_stats.defense} - IV: ${tmpMonster[0].defense}/31
				**Sp. Atk**: ${monster_stats.sp_attack} - IV: ${tmpMonster[0].sp_attack}/31
				**Sp. Def**: ${monster_stats.sp_defense} - IV: ${tmpMonster[0].sp_defense}/31
				**Speed**: ${monster_stats.speed} - IV: ${tmpMonster[0].speed}/31\n
				**Total IV %**: ${iv_avg.toFixed(2)}%`);
        await message.channel
          .send(embed)
          .then((message) => {
            return message;
          })
          .catch(console.error);
      }
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

    const monsters = getAllMonsters();

    const monster = monsters[tmpMonster[0].monster_id - 1];

    const monster_types = monster.type.join(' | ');

    const tmpID = `${monster.id}`.padStart(3, '0');

    const monster_nature = tmpMonster[0].nature;

    const monster_stats = {
      hp: Math.round(
        2 * monster.base.HP +
          (tmpMonster[0].hp * tmpMonster[0].level) / 100 +
          tmpMonster[0].level +
          10,
      ),
      attack: Math.round(
        2 * monster.base.Attack +
          (tmpMonster[0].attack * tmpMonster[0].level) / 100 +
          5,
      ),
      defense: Math.round(
        2 * monster.base.Defense +
          (tmpMonster[0].defense * tmpMonster[0].level) / 100 +
          5,
      ),
      sp_attack: Math.round(
        2 * monster.base['Sp. Attack'] +
          (tmpMonster[0].sp_attack * tmpMonster[0].level) / 100 +
          5,
      ),
      sp_defense: Math.round(
        2 * monster.base['Sp. Defense'] +
          (tmpMonster[0].sp_defense * tmpMonster[0].level) / 100 +
          5,
      ),
      speed: Math.round(
        2 * monster.base.Speed +
          (tmpMonster[0].speed * tmpMonster[0].level) / 100 +
          5,
      ),
    };

    const iv_avg =
      ((tmpMonster[0].hp +
        tmpMonster[0].attack +
        tmpMonster[0].defense +
        tmpMonster[0].sp_attack +
        tmpMonster[0].sp_defense +
        tmpMonster[0].speed) /
        186) *
      100;

    if (tmpMonster[0].shiny) {
      const embed = new MessageEmbed()

        .setAuthor(
          `Level ${tmpMonster[0].level}  ${monster.name.english} *SHINY`,
          img_monster_ball,
          `https://bulbapedia.bulbagarden.net/wiki/${monster.name.english}_(Pokémon)`,
        )
        .setColor(0xf1912b)
        .setImage(`https://bot.smokey.gg/pokemon/images/gif/${tmpID}_shiny.gif`)
        // .setImage(`https://www.serebii.net/Shiny/SWSH/${tmpID}.png`)
        // .setImage(`https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`)
        .setThumbnail(
          `https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`,
        )
        .setDescription(`<:star:719087649536606208> **SHINY** <:star:719087649536606208>\n
		**ID**: ${tmpMonster[0].id}
		**Exp**: ${format_number(tmpMonster[0].experience)}
		**Type**: ${monster_types}
		**Nature**: ${monster_nature}
		**HP**: ${monster_stats.hp} - IV: ${tmpMonster[0].hp}/31
		**Attack**: ${monster_stats.attack} - IV: ${tmpMonster[0].attack}/31
		**Defense**: ${monster_stats.defense} - IV: ${tmpMonster[0].defense}/31
		**Sp. Atk**: ${monster_stats.sp_attack} - IV: ${tmpMonster[0].sp_attack}/31
		**Sp. Def**: ${monster_stats.sp_defense} - IV: ${tmpMonster[0].sp_defense}/31
		**Speed**: ${monster_stats.speed} - IV: ${tmpMonster[0].speed}/31\n
		**Total IV %**: ${iv_avg.toFixed(2)}%`);
      await message.channel
        .send(embed)
        .then((message) => {
          return message;
        })
        .catch(console.error);
    } else {
      const embed = new MessageEmbed() // .setThumbnail(`https://bot.smokey.gg/pokemon/images/sprites/${tmpID}MS.png`)
        .setAuthor(
          `Level ${tmpMonster[0].level} ${monster.name.english}`,
          img_monster_ball,
          `https://bulbapedia.bulbagarden.net/wiki/${monster.name.english}_(Pokémon)`,
        )
        // .setTitle(`**Level ${tmpMonster[0].level} ${monster.name.english}**`)
        .setColor(0xff0000)
        .setThumbnail(`https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`)
        .setImage(`https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`)
        .setDescription(`**ID**: ${tmpMonster[0].id}
		**Exp**: ${format_number(tmpMonster[0].experience)}
		**Type**: ${monster_types}
		**Nature**: ${monster_nature}
		**HP**: ${monster_stats.hp} - IV: ${tmpMonster[0].hp}/31
		**Attack**: ${monster_stats.attack} - IV: ${tmpMonster[0].attack}/31
		**Defense**: ${monster_stats.defense} - IV: ${tmpMonster[0].defense}/31
		**Sp. Atk**: ${monster_stats.sp_attack} - IV: ${tmpMonster[0].sp_attack}/31
		**Sp. Def**: ${monster_stats.sp_defense} - IV: ${tmpMonster[0].sp_defense}/31
		**Speed**: ${monster_stats.speed} - IV: ${tmpMonster[0].speed}/31\n
		**Total IV %**: ${iv_avg.toFixed(2)}%`);
      await message.channel
        .send(embed)
        .then((message) => {
          return message;
        })
        .catch(console.error);
    }
  }
}

/**
 * Get a specific Monster's information.
 * @param id
 */
export async function monsterDex(message: Message): Promise<void> {
  const tmpSplit = message.content.split(' ');

  const monsters = getPokedex();

  let tempMonster = undefined;

  monsters.forEach(async (element) => {
    if (element.name.english.toLowerCase() == tmpSplit[1].toLowerCase()) {
      tempMonster = element;
    }
  });

  if (tempMonster) {
    const monster_types = tempMonster.type.join(' | ');

    const tmpID = `${tempMonster.id}`.padStart(3, '0');

    const monster_stats = {
      hp: tempMonster.base.HP,
      attack: tempMonster.base.Attack,
      defense: tempMonster.base.Defense,
      sp_attack: tempMonster.base['Sp. Attack'],
      sp_defense: tempMonster.base['Sp. Defense'],
      speed: tempMonster.base.Speed,
    };

    /* future shiny stuff
    let thumbnail = ``;
    let image = ``;

    // shiny
    if (tmpSplit[2] == '+'){
      thumbnail = ``;
      image = ``;
    }else{
      // not shiny
      thumbnail = ``;
      image = ``;
    }*/

    const embed = new MessageEmbed()
      .setAuthor(
        '#' + tmpID + ' - ' + tempMonster.name.english,
        img_monster_ball,
        `https://bulbapedia.bulbagarden.net/wiki/${tempMonster.name.english}_(Pokémon)`,
      )
      .setColor(0x12bca4)
      .setThumbnail(`https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`)
      .setImage(`https://bot.smokey.gg/pokemon/images/hd/${tmpID}.png`)
      .setDescription(`**Type(s)**: ${monster_types}

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
