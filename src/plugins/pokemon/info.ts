import { Message, MessageEmbed } from 'discord.js';

import { format_number } from '../../utils';
// import { getLogger } from '../../clients/logger';
import { getAllMonsters } from './monsters';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import {
  databaseClient,
  IUserSettings,
  UserSettingsTable,
} from '../../clients/database';

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
          .setTitle(
            `**Level ${tmpMonster[0].level} ${monster.name.english} <:star:719087649536606208>**`,
          )
          .setColor(0xff0000)
          .setImage(`https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`)
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
          .setTitle(`**Level ${tmpMonster[0].level} ${monster.name.english}**`)
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
        .setTitle(
          `**Level ${tmpMonster[0].level} ${monster.name.english} <:star:719087649536606208>**`,
        )
        .setColor(0xff0000)
        .setImage(`https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`)
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
        .setTitle(`**Level ${tmpMonster[0].level} ${monster.name.english}**`)
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
