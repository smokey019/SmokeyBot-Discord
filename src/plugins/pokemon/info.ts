import { Message, MessageEmbed } from 'discord.js';
import { databaseClient, getUser } from '../../clients/database';
import { getLogger } from '../../clients/logger';
import { IMonsterModel, MonsterTable } from '../../models/Monster';
import { IMonsterUserModel, MonsterUserTable } from '../../models/MonsterUser';
import { format_number } from '../../utils';
import { findMonsterByID, findMonsterByName, IMonsterDex } from './monsters';
import { img_monster_ball } from './utils';

const logger = getLogger('Info');

export async function monsterEmbed(
	monster_db: IMonsterModel,
	message: Message,
): Promise<void> {
	if (!monster_db) {
		return;
	}

	const monster = findMonsterByID(monster_db.monster_id);

	const monster_types = monster.type.join(' | ');

	const tmpID = `${monster.id}`.padStart(3, '0');

	const monster_nature = monster_db.nature;

	const next_level_xp = monster_db.level * 1250 + 1250;

	const count = format_number(
		await monsterCount(monster.id, message.author.id),
	);

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

	let released = ``;
	if (monster_db.released) {
		released = '\n***RELEASED***\n\n';
	}

	let legendary = ``;
	if (monster.special) {
		legendary = ` 💠`;
	} else {
		legendary = '';
	}

	/*let original = `✅`;
  if (monster_db.uid != monster_db.original_uid) {
    original = `🔴`;
  }*/

	if (monster_db.shiny) {
		const embed = new MessageEmbed()
			.setAuthor(
				`Level ${monster_db.level} ${monster.name.english} ⭐${favorite}${legendary}`,
				img_monster_ball,
				`https://pokemondb.net/pokedex/${monster.id}`,
			)
			.setColor(monster.color)
			.setImage(monster.images.shiny)
			.setThumbnail(monster.images['gif-shiny'])
			.setDescription(`⭐ __**SHINY**__ ⭐\n${released}

    **ID**: ${monster_db.id}
    **National №**: ${tmpID}
    **Dex Count**: ${count}

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
    **Speed**: ${monster_stats.speed} - IV: ${monster_db.speed}/31

    **Total IV %**: ${iv_avg.toFixed(2)}%`);
		await message.channel
			.send(embed)
			.then((message) => {
				return message;
			})
			.catch(console.error);
	} else if (!monster_db.shiny) {
		const embed = new MessageEmbed()
			.setAuthor(
				`Level ${monster_db.level} ${monster.name.english}${favorite}${legendary}`,
				img_monster_ball,
				`https://pokemondb.net/pokedex/${monster.id}`,
			)
			.setColor(monster.color)
			.setThumbnail(monster.images.gif)
			.setImage(monster.images.normal).setDescription(`${released}**ID**: ${
			monster_db.id
		}
    **National №**: ${tmpID}
    **Dex Count**: ${count}

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
    **Speed**: ${monster_stats.speed} - IV: ${monster_db.speed}/31

    **Total IV %**: ${iv_avg.toFixed(2)}%`);
		await message.channel
			.send(embed)
			.then((message) => {
				return message;
			})
			.catch(console.error);
	}
}

export async function monsterEmbedBeta(
	monster_db: IMonsterModel,
	message: Message,
): Promise<void> {
	if (!monster_db) {
		return;
	}

	const monster = findMonsterByID(monster_db.monster_id);

	const monster_types = monster.type.join(' | ');

	const tmpID = `${monster.id}`.padStart(3, '0');

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
		if (monster.id > 809) {
			thumbnail = `https://img.pokemondb.net/sprites/home/shiny/${monster.name.english.toLowerCase()}.png`;
		} else {
			thumbnail = `https://bot.smokey.gg/pokemon/images/gif/${tmpID}_shiny.gif`;
		}
	} else {
		img = monster.images.normal;
		if (monster.id > 809) {
			thumbnail = `https://img.pokemondb.net/sprites/home/normal/${monster.name.english.toLowerCase()}.png`;
		} else {
			thumbnail = `https://bot.smokey.gg/pokemon/images/gif/${tmpID}.gif`;
		}
	}

	if (monster.special) {
		legendary = ` 💠`;
	}

	let released = ``;
	if (monster_db.released) {
		released = '\n***RELEASED***\n\n';
	}

	const embed = new MessageEmbed()
		.setAuthor(
			`Level ${monster_db.level} ${monster.name.english} ${shiny}${favorite}${legendary}`,
			img_monster_ball,
			`https://pokemondb.net/pokedex/${monster.id}`,
		)
		.setColor(monster.color)
		.setImage(img)
		.setThumbnail(thumbnail)
		.setDescription(released)
		.addFields(
			{ name: '**ID**', value: monster_db.id, inline: true },
			{ name: '**National №**', value: tmpID, inline: true },
			{ name: '**Level**', value: monster_db.level, inline: true },
			//{ name: '\u200B', value: '\u200B' },
			{
				name: '**Exp**',
				value:
					format_number(monster_db.experience) +
					' / ' +
					format_number(next_level_xp),
				inline: false,
			},
			{ name: '**Type**', value: monster_types, inline: false },
			//{ name: '\u200B', value: '\u200B' },
			{
				name: '**HP**',
				value: `${monster_stats.hp} \n IV: ${monster_db.hp}/31`,
				inline: true,
			},
			{
				name: '**Attack**',
				value: `${monster_stats.attack} \n IV: ${monster_db.attack}/31`,
				inline: true,
			},
			{
				name: '**Defense**',
				value: `${monster_stats.defense} \n IV: ${monster_db.defense}/31`,
				inline: true,
			},
			{
				name: '**Sp. Atk**',
				value: `${monster_stats.sp_attack} \n IV: ${monster_db.sp_attack}/31`,
				inline: true,
			},
			{
				name: '**Sp. Def**',
				value: `${monster_stats.sp_defense} \n IV: ${monster_db.sp_defense}/31`,
				inline: true,
			},
			{
				name: '**Speed**',
				value: `${monster_stats.speed} \n IV: ${monster_db.speed}/31\n`,
				inline: true,
			},
			//{ name: '\u200B', value: '\u200B' },
			{ name: '**Total IV %**', value: `${iv_avg.toFixed(2)}%` },
		);
	try {
		await message.channel.send(embed);
	} catch (error) {
		logger.error(error);
	}
}

/**
 * Get latest Monster caught's information.
 * @param message
 */
export async function monsterInfoLatest(message: Message): Promise<void> {
	const user = await databaseClient<IMonsterUserModel>(MonsterUserTable)
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
export async function currentMonsterInfoBETA(message: Message): Promise<void> {
	const user: IMonsterUserModel = await getUser(message.author.id);

	if (!user) return;

	const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
		.select()
		.where('id', user.current_monster);

	if (!tmpMonster) return;

	await monsterEmbedBeta(tmpMonster[0], message);
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
 * Get current Monster's information.
 * @param id
 */
export async function currentMonsterInfo(message: Message): Promise<void> {
	const user: IMonsterUserModel = await getUser(message.author.id);

	if (!user) return;

	const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
		.select()
		.where('id', user.current_monster);

	if (!tmpMonster) return;

	monsterEmbed(tmpMonster[0], message);
}

/**
 * Get a specific Monster's information.
 * @param message
 */
export async function monsterDex(message: Message): Promise<void> {
	const tmpSplit = message.content.split(' ');
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
			await monsterCount(tempMonster.id, message.author.id),
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
			.setColor(tempMonster.color)
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
		await message.channel
			.send(embed)
			.then((message) => {
				return message;
			})
			.catch(console.error);
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

export async function userDex(message: Message): Promise<number[]> {
	const dex = [];

	const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
		.select('monster_id')
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
