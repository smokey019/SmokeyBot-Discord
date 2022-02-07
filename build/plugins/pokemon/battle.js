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
exports.battleParser = void 0;
const discord_js_1 = require("discord.js");
const logger_1 = require("../../clients/logger");
const colors_1 = require("../../colors");
const utils_1 = require("./utils");
const logger = (0, logger_1.getLogger)('Battles');
function monsterChooseAbility(interaction, args) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!args) {
            args.shift();
        }
        const embed = new discord_js_1.MessageEmbed()
            .setAuthor(`Battle - Mew vs Mewtwo`, utils_1.img_monster_ball)
            .setColor(colors_1.COLOR_RED)
            .setImage(`https://www.pokencyclopedia.info/sprites/3ds/ani-b_6/3a-b__150__xy.gif`)
            .setThumbnail(`https://www.pokencyclopedia.info/sprites/3ds/ani_6/3ani__151__xy.gif`)
            .addFields({ name: '**0**', value: 'Ability 0' }, { name: '**1**', value: 'Ability 1' }, { name: '**2**', value: 'Escape' }, { name: '\u200B', value: '\u200B' }, {
            name: "**Mewtwo's HP**",
            value: `100/420`,
            inline: true,
        }, {
            name: "**Mew's HP**",
            value: `100/420`,
            inline: true,
        })
            .setDescription(`USER1's Turn! Pick an ability to use.`);
        yield interaction
            .reply({ embeds: [embed] })
            .then((interaction) => {
            return interaction;
        })
            .catch((err) => {
            logger.error(err);
        });
    });
}
function battleParser(interaction, args) {
    return __awaiter(this, void 0, void 0, function* () {
        if (args[0] == 'test') {
            monsterChooseAbility(interaction, args);
        }
    });
}
exports.battleParser = battleParser;
