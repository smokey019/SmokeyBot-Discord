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
exports.userDex = exports.monsterCount = exports.monsterDex = exports.currentMonsterInfo = exports.monsterInfo = exports.monsterInfoLatest = exports.monsterEmbed = exports.checkUniqueMonsters = void 0;
const discord_js_1 = require("discord.js");
const database_1 = require("../../clients/database");
const logger_1 = require("../../clients/logger");
const queue_1 = require("../../clients/queue");
const colors_1 = require("../../colors");
const Monster_1 = require("../../models/Monster");
const MonsterUser_1 = require("../../models/MonsterUser");
const utils_1 = require("../../utils");
const monsters_1 = require("./monsters");
const utils_2 = require("./utils");
const logger = (0, logger_1.getLogger)('Info');
function checkUniqueMonsters(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const tempdex = yield userDex(interaction.user.id);
        (0, queue_1.queueMsg)(`You have ${tempdex.length}/${monsters_1.MonsterDex.size} total unique Pokémon in your Pokédex.`, interaction, false, 0, undefined);
    });
}
exports.checkUniqueMonsters = checkUniqueMonsters;
function monsterEmbed(monster_db, interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!monster_db) {
            return;
        }
        const monster = yield (0, monsters_1.findMonsterByID)(monster_db.monster_id);
        const monster_types = monster.type.join(' | ');
        const tmpID = `${monster.id}`.padStart(3, '0');
        const next_level_xp = monster_db.level * 1250;
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
        if (monster_db.egg && monster_db.hatched_at) {
            const hatched_at = new Date(monster_db.hatched_at).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
            });
            embedFields.push({
                name: '**Hatched On**',
                value: hatched_at,
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
            (0, queue_1.queueMsg)(embed, interaction, true, 0, undefined, true);
        }
        catch (error) {
            logger.error(error);
        }
    });
}
exports.monsterEmbed = monsterEmbed;
/**
 * Get latest Monster caught's information.
 * @param interaction
 */
function monsterInfoLatest(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.databaseClient)(MonsterUser_1.MonsterUserTable)
            .select()
            .where('uid', interaction.user.id);
        if (user) {
            if (user[0].latest_monster) {
                const tmpMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                    .select()
                    .where('id', user[0].latest_monster);
                if (!tmpMonster)
                    return;
                monsterEmbed(tmpMonster[0], interaction);
            }
        }
    });
}
exports.monsterInfoLatest = monsterInfoLatest;
/**
 * Get a specific Monster's information.
 * @param id
 */
function monsterInfo(interaction, monster_id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (monster_id) {
            const tmpMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
                .select()
                .where('id', monster_id);
            if (!tmpMonster)
                return;
            monsterEmbed(tmpMonster[0], interaction);
        }
    });
}
exports.monsterInfo = monsterInfo;
/**
 * Get current Monster's information.
 * @param id
 */
function currentMonsterInfo(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, database_1.getUser)(interaction.user.id);
        if (!user)
            return;
        const tmpMonster = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
            .select()
            .where('id', user.current_monster);
        if (!tmpMonster)
            return;
        monsterEmbed(tmpMonster[0], interaction);
    });
}
exports.currentMonsterInfo = currentMonsterInfo;
/**
 * Get a specific Monster's information.
 * @param interaction
 */
function monsterDex(interaction) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        const searchShiny = interaction.options.getString('pokemon').match(/shiny/i);
        let tmp = interaction.options.getString('pokemon');
        let tempMonster = undefined;
        if (searchShiny) {
            tmp = tmp.replace(/shiny/i, '');
        }
        tempMonster = (0, monsters_1.findMonsterByName)(tmp.toLowerCase());
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
            const count = (0, utils_1.format_number)(yield monsterCount(tempMonster.id, interaction.user.id));
            if (tempMonster.region || tempMonster.forme) {
                // shiny
                if (searchShiny) {
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
                if (searchShiny) {
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
            const evolve = (_b = (_a = tempMonster.evos) === null || _a === void 0 ? void 0 : _a.join(' | ')) !== null && _b !== void 0 ? _b : 'None';
            const prevolve = (_c = tempMonster.prevo) !== null && _c !== void 0 ? _c : 'None';
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
            (0, queue_1.queueMsg)(embed, interaction, true, 0, undefined, true);
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
function userDex(user) {
    return __awaiter(this, void 0, void 0, function* () {
        const dex = [];
        const pokemon = yield (0, database_1.databaseClient)(Monster_1.MonsterTable)
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
    });
}
exports.userDex = userDex;
