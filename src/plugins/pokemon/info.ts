import { EmbedFieldData, Interaction, MessageEmbed } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { queueMsg } from '../../clients/queue';
import { COLOR_PURPLE } from '../../colors';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { format_number } from '../../utils';
import {
  findMonsterByID,
  findMonsterByName,
  IMonsterDex,
  MonsterDex
} from './monsters';
import { img_monster_ball } from './utils';

const logger = getLogger('Info');

export async function checkUniqueMonsters(interaction: Interaction): Promise<void> {
  const tempdex = await userDex(interaction.user.id);
  queueMsg(`You have ${tempdex.length}/${MonsterDex.size} total unique Pokémon in your Pokédex.`, interaction, false, 0, undefined);
}

export async function monsterEmbed(
  monster_db: IMonsterModel,
  interaction: Interaction,
): Promise<void> {
  if (!monster_db) {
    return;
  }

  const monster = await findMonsterByID(monster_db.monster_id);

  const monster_types = monster.type.join(' | ');

  const tmpID = `${monster.id}`.padStart(3, '0');

  const next_level_xp = monster_db.level * 1250;

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

  let legendary = ``;
  let favorite = ``;
  let shiny = ``;
  let img = ``;
  let thumbnail = ``;

  if (monster_db.favorite) {
    favorite = ' 💟';
  }

  if (monster_db.shiny) {
    shiny = ' ⭐';
    img = monster.images.shiny;
    thumbnail = monster.images['gif-shiny'];
  } else {
    img = monster.images.normal;
    thumbnail = monster.images.gif;
  }

  if (monster.special) {
    legendary = ` 💠`;
  }

  let released = ` `;
  if (monster_db.released) {
    const release_time = new Date(monster_db.released_at).toLocaleDateString(
      'en-US',
      {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      },
    );
    released = `\n***Released on ${release_time}***\n\n`;
  }

  let gender = ``;
  if ((monster.gender && monster.gender != 'N') || monster.genderRatio) {
    if (monster_db.gender == 'M') {
      gender = '♂️ ';
    } else if (monster_db.gender == 'F') {
      gender = '♀️ ';
    }
  }

  let title = `Level ${monster_db.level} ${monster.name.english} ${gender}${shiny}${favorite}${legendary}`;

  if (monster_db.nickname) {
    title = `Level ${monster_db.level} '${monster_db.nickname}' - ${monster.name.english} ${gender}${shiny}${favorite}${legendary}`;
  }

  const embedFields: EmbedFieldData[] = [];

  embedFields.push({
    name: '**ID**',
    value: monster_db.id.toString(),
    inline: true,
  });
  embedFields.push({ name: '**National №**', value: tmpID, inline: true });
  embedFields.push({
    name: '**Level**',
    value: monster_db.level.toString(),
    inline: true,
  });
  embedFields.push({
    name: '**Exp**',
    value:
      format_number(monster_db.experience) +
      ' / ' +
      format_number(next_level_xp),
    inline: false,
  });
  embedFields.push({ name: '**Type**', value: monster_types, inline: false });
  embedFields.push({
    name: '**HP**',
    value: `${monster_stats.hp} \n IV: ${monster_db.hp}/31`,
    inline: true,
  });
  embedFields.push({
    name: '**Attack**',
    value: `${monster_stats.attack} \n IV: ${monster_db.attack}/31`,
    inline: true,
  });
  embedFields.push({
    name: '**Defense**',
    value: `${monster_stats.defense} \n IV: ${monster_db.defense}/31`,
    inline: true,
  });
  embedFields.push({
    name: '**Sp. Atk**',
    value: `${monster_stats.sp_attack} \n IV: ${monster_db.sp_attack}/31`,
    inline: true,
  });
  embedFields.push({
    name: '**Sp. Def**',
    value: `${monster_stats.sp_defense} \n IV: ${monster_db.sp_defense}/31`,
    inline: true,
  });
  embedFields.push({
    name: '**Speed**',
    value: `${monster_stats.speed} \n IV: ${monster_db.speed}/31\n`,
    inline: true,
  });
  embedFields.push({
    name: '**Total IV %**',
    value: `${iv_avg.toFixed(2)}%`,
    inline: true,
  });
  embedFields.push({
    name: '**Current Owner**',
    value: `<@${monster_db.uid}>`,
    inline: true,
  });
  if (monster_db.original_uid != monster_db.uid) {
    embedFields.push({
      name: '**Original Owner**',
      value: `<@${monster_db.original_uid}>`,
      inline: true,
    });
  }
  if (monster_db.egg && monster_db.hatched_at) {
    const hatched_at = new Date(monster_db.hatched_at).toLocaleDateString(
      'en-US',
      {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      },
    );
    embedFields.push({
      name: '**Hatched On**',
      value: hatched_at,
      inline: true,
    });
  }

  const embed = new MessageEmbed()
    .setAuthor(
      title,
      img_monster_ball,
      `https://pokemondb.net/pokedex/${monster.id}`,
    )
    .setColor(COLOR_PURPLE)
    .setImage(img)
    .setThumbnail(thumbnail)
    .setDescription(released)
    .addFields(embedFields);
  try {
    queueMsg(embed, interaction, false, 0, undefined, true);
  } catch (error) {
    logger.error(error);
  }
}

/**
 * Get latest Monster caught's information.
 * @param interaction
 */
export async function monsterInfoLatest(interaction: Interaction): Promise<void> {
  const user = await databaseClient<IMonsterUserModel>(MonsterUserTable)
    .select()
    .where('uid', interaction.user.id);

  if (user) {
    if (user[0].latest_monster) {
      const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
        .select()
        .where('id', user[0].latest_monster);

      if (!tmpMonster) return;

      monsterEmbed(tmpMonster[0], interaction);
    }
  }
}

/**
 * Get a specific Monster's information.
 * @param id
 */
export async function currentMonsterInfoBETA(interaction: Interaction): Promise<void> {
  const user: IMonsterUserModel = await getUser(interaction.user.id);

  if (!user) return;

  const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where('id', user.current_monster);

  if (!tmpMonster) return;

  await monsterEmbed(tmpMonster[0], interaction);
}

/**
 * Get a specific Monster's information.
 * @param id
 */
export async function monsterInfo(interaction: Interaction, monster_id: string): Promise<void> {

  if (monster_id) {
    const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where('id', monster_id);

    if (!tmpMonster) return;

    monsterEmbed(tmpMonster[0], interaction);
  }
}

/**
 * Get current Monster's information.
 * @param id
 */
export async function currentMonsterInfo(interaction: Interaction): Promise<void> {
  const user: IMonsterUserModel = await getUser(interaction.user.id);

  if (!user) return;

  const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where('id', user.current_monster);

  if (!tmpMonster) return;

  monsterEmbed(tmpMonster[0], interaction);
}

/**
 * Get a specific Monster's information.
 * @param interaction
 */
export async function monsterDex(interaction: Interaction, args: string[]): Promise<void> {
  const tmpSplit = args;
  let tempMonster: IMonsterDex = undefined;

  /**
   * TODO: this breaks with names with too many spaces: '~dex mega mewtwo y --shiny'
   */
  if (tmpSplit.length >= 3 && !tmpSplit[2].match(/shiny/i)) {
    tempMonster = findMonsterByName(
      tmpSplit[1].toLowerCase() + ' ' + tmpSplit[2].toLowerCase(),
    );
  } else {
    tempMonster = findMonsterByName(tmpSplit[1]?.toLowerCase());
  }

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
    const count = format_number(
      await monsterCount(tempMonster.id, interaction.user.id),
    );

    if (tempMonster.region || tempMonster.forme) {
      // shiny
      if (tmpSplit[tmpSplit.length - 1].match(/shiny/i)) {
        thumbnail = tempMonster.images['gif-shiny'];
        image = tempMonster.images.shiny;
      } else {
        // not shiny
        thumbnail = tempMonster.images.gif;
        image = tempMonster.images.normal;
      }
    } else {
      // shiny
      if (tmpSplit[tmpSplit.length - 1].match(/shiny/i)) {
        thumbnail = tempMonster.images['gif-shiny'];
        image = tempMonster.images.shiny;
      } else {
        // not shiny
        thumbnail = tempMonster.images.gif;
        image = tempMonster.images.normal;
      }
    }

    let legendary = '';
    if (tempMonster.special) {
      legendary = ` 💠`;
    }

    const evolve = tempMonster.evos?.join(' | ') ?? 'None';
    const prevolve = tempMonster.prevo ?? 'None';

    let evo_item = '';
    if (tempMonster.evos) {
      const tmpEvo = findMonsterByName(tempMonster.evos[0]);
      if (tmpEvo?.evoItem) {
        evo_item = ' with item ' + tmpEvo.evoItem;
      }
    }

    const embed = new MessageEmbed()
      .setAuthor(
        '#' + tmpID + ' - ' + tempMonster.name.english + legendary,
        img_monster_ball,
        `https://pokemondb.net/pokedex/${tempMonster.id}`,
      )
      .setColor(COLOR_PURPLE)
      .setThumbnail(thumbnail)
      .setImage(image).setDescription(`**Type(s)**: ${monster_types}

      **National №**: ${tmpID}
      **Your PokeDex Count**: ${count}

    **Base Stats**

    **HP**: ${monster_stats.hp}
    **Attack**: ${monster_stats.attack}
    **Defense**: ${monster_stats.defense}
    **Sp. Atk**: ${monster_stats.sp_attack}
    **Sp. Def**: ${monster_stats.sp_defense}
    **Speed**: ${monster_stats.speed}

	**Prevolve**: ${prevolve}
    **Evolve**: ${evolve + evo_item}`);
    await interaction.channel
      .send({ embeds: [embed] })
      .then((interaction) => {
        return interaction;
      })
      .catch((err) => {
        logger.error(err);
      });
  }
}

export async function monsterCount(id: number, uid: string): Promise<number> {
  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select('id')
    .where({
      monster_id: id,
      uid: uid,
    });

  return pokemon.length;
}

export async function userDex(user: string): Promise<number[]> {
  const dex = [];

  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select('monster_id')
    .where({
      uid: user,
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
