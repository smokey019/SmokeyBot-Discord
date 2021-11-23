"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userDex = exports.monsterCount = exports.monsterDex = exports.currentMonsterInfo = exports.monsterInfo = exports.currentMonsterInfoBETA = exports.monsterInfoLatest = exports.monsterEmbed = exports.checkUniqueMonsters = void 0;
const discord_js_1 = require("discord.js");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const colors_1 = require("../../colors");
const Monster_1 = require("../../models/Monster");
const MonsterUser_1 = require("../../models/MonsterUser");
const utils_1 = require("../../utils");
const monsters_1 = require("./monsters");
const utils_2 = require("./utils");
const logger = (0, logger_1.getLogger)('Info');
function checkUniqueMonsters(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const tempdex = yield userDex(message);
        yield message.reply(`You have ${tempdex.length}/${monsters_1.MonsterDex.size} total unique Pokémon in your Pokédex.`);
    });
}
exports.checkUniqueMonsters = checkUniqueMonsters;
function monsterEmbed(monster_db, message) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!monster_db) {
            return;
        }
        const monster = yield (0, monsters_1.findMonsterByID)(monster_db.monster_id);
        const monster_types = monster.type.join(' | ');
        const tmpID = `${monster.id}`.padStart(3, '0');
        const next_level_xp = monster_db.level * 1250 + 1250;
        const monster_stats = {
            hp: Math.round(2 * monster.baseStats.hp +
                (monster_db.hp * monster_db.level) / 100 +
                monster_db.level +
                10),
            attack: Math.round(2 * monster.baseStats.atk +
                (monster_db.attack * monster_db.level) / 100 +
                5),
            defense: Math.round(2 * monster.baseStats.def +
                (monster_db.defense * monster_db.level) / 100 +
                5),
            sp_attack: Math.round(2 * monster.baseStats.spa +
                (monster_db.sp_attack * monster_db.level) / 100 +
                5),
            sp_defense: Math.round(2 * monster.baseStats.spd +
                (monster_db.sp_defense * monster_db.level) / 100 +
                5),
            speed: Math.round(2 * monster.baseStats.spe +
                (monster_db.speed * monster_db.level) / 100 +
                5),
        };
        const iv_avg = ((monster_db.hp +
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
        }
        else {
            img = monster.images.normal;
            thumbnail = monster.images.gif;
        }
        if (monster.special) {
            legendary = ` 💠`;
        }
        let released = ` `;
        if (monster_db.released) {
            const release_time = new Date(monster_db.released_at).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            released = `\n***Released on ${release_time}***\n\n`;
        }
        let gender = ``;
        if ((monster.gender && monster.gender != 'N') || monster.genderRatio) {
            if (monster_db.gender == 'M') {
                gender = '♂️ ';
            }
            else if (monster_db.gender == 'F') {
                gender = '♀️ ';
            }
        }
        let title = `Level ${monster_db.level} ${monster.name.english} ${gender}${shiny}${favorite}${legendary}`;
        if (monster_db.nickname) {
            title = `Level ${monster_db.level} '${monster_db.nickname}' - ${monster.name.english} ${gender}${shiny}${favorite}${legendary}`;
        }
        const embedFields = [];
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
            value: (0, utils_1.format_number)(monster_db.experience) +
                ' / ' +
                (0, utils_1.format_number)(next_level_xp),
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
        const embed = new discord_js_1.MessageEmbed()
            .setAuthor(title, utils_2.img_monster_ball, `https://pokemondb.net/pokedex/${monster.id}`)
            .setColor(colors_1.COLOR_PURPLE)
            .setImage(img)
            .setThumbnail(thumbnail)
            .setDescription(released)
            .addFields(embedFields);
        try {
            yield message.channel.send({ embeds: [embed] });
        }
        catch (error) {
            logger.error(error);
        }
    });
}
exports.monsterEmbed = monsterEmbed;
/**
 * Get latest Monster caught's information.
 * @param message
 */
function monsterInfoLatest(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
            .select()
            .where('uid', message.author.id);
        if (user) {
            if (user[0].latest_monster) {
                const tmpMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .where('id', user[0].latest_monster);
                if (!tmpMonster)
                    return;
                monsterEmbed(tmpMonster[0], message);
            }
        }
    });
}
exports.monsterInfoLatest = monsterInfoLatest;
/**
 * Get a specific Monster's information.
 * @param id
 */
function currentMonsterInfoBETA(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(message.author.id);
        if (!user)
            return;
        const tmpMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where('id', user.current_monster);
        if (!tmpMonster)
            return;
        yield monsterEmbed(tmpMonster[0], message);
    });
}
exports.currentMonsterInfoBETA = currentMonsterInfoBETA;
/**
 * Get a specific Monster's information.
 * @param id
 */
function monsterInfo(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const tmpSplit = message.content.split(' ');
        if (tmpSplit.length == 2) {
            const tmpMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .select()
                .where('id', tmpSplit[1]);
            if (!tmpMonster)
                return;
            monsterEmbed(tmpMonster[0], message);
        }
    });
}
exports.monsterInfo = monsterInfo;
/**
 * Get current Monster's information.
 * @param id
 */
function currentMonsterInfo(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(message.author.id);
        if (!user)
            return;
        const tmpMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where('id', user.current_monster);
        if (!tmpMonster)
            return;
        monsterEmbed(tmpMonster[0], message);
    });
}
exports.currentMonsterInfo = currentMonsterInfo;
/**
 * Get a specific Monster's information.
 * @param message
 */
function monsterDex(message) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        const tmpSplit = message.content.split(' ');
        let tempMonster = undefined;
        /**
         * TODO: this breaks with names with too many spaces: '~dex mega mewtwo y --shiny'
         */
        if (tmpSplit.length >= 3 && !tmpSplit[2].match(/shiny/i)) {
            tempMonster = (0, monsters_1.findMonsterByName)(tmpSplit[1].toLowerCase() + ' ' + tmpSplit[2].toLowerCase());
        }
        else {
            tempMonster = (0, monsters_1.findMonsterByName)((_a = tmpSplit[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase());
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
            const count = (0, utils_1.format_number)(yield monsterCount(tempMonster.id, message.author.id));
            if (tempMonster.region || tempMonster.forme) {
                // shiny
                if (tmpSplit[tmpSplit.length - 1].match(/shiny/i)) {
                    thumbnail = tempMonster.images['gif-shiny'];
                    image = tempMonster.images.shiny;
                }
                else {
                    // not shiny
                    thumbnail = tempMonster.images.gif;
                    image = tempMonster.images.normal;
                }
            }
            else {
                // shiny
                if (tmpSplit[tmpSplit.length - 1].match(/shiny/i)) {
                    thumbnail = tempMonster.images['gif-shiny'];
                    image = tempMonster.images.shiny;
                }
                else {
                    // not shiny
                    thumbnail = tempMonster.images.gif;
                    image = tempMonster.images.normal;
                }
            }
            let legendary = '';
            if (tempMonster.special) {
                legendary = ` 💠`;
            }
            const evolve = (_c = (_b = tempMonster.evos) === null || _b === void 0 ? void 0 : _b.join(' | ')) !== null && _c !== void 0 ? _c : 'None';
            const prevolve = (_d = tempMonster.prevo) !== null && _d !== void 0 ? _d : 'None';
            let evo_item = '';
            if (tempMonster.evos) {
                const tmpEvo = (0, monsters_1.findMonsterByName)(tempMonster.evos[0]);
                if (tmpEvo === null || tmpEvo === void 0 ? void 0 : tmpEvo.evoItem) {
                    evo_item = ' with item ' + tmpEvo.evoItem;
                }
            }
            const embed = new discord_js_1.MessageEmbed()
                .setAuthor('#' + tmpID + ' - ' + tempMonster.name.english + legendary, utils_2.img_monster_ball, `https://pokemondb.net/pokedex/${tempMonster.id}`)
                .setColor(colors_1.COLOR_PURPLE)
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
            yield message.channel
                .send({ embeds: [embed] })
                .then((message) => {
                return message;
            })
                .catch((err) => {
                logger.error(err);
            });
        }
    });
}
exports.monsterDex = monsterDex;
function monsterCount(id, uid) {
    return __awaiter(this, void 0, void 0, function* () {
        const pokemon = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select('id')
            .where({
            monster_id: id,
            uid: uid,
        });
        return pokemon.length;
    });
}
exports.monsterCount = monsterCount;
function userDex(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const dex = [];
        const pokemon = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
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
    });
}
exports.userDex = userDex;
