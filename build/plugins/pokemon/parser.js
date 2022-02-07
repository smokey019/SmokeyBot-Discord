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
exports.set_prefix = exports.updatePrefixes = exports.getPrefixes = exports.default_prefixes = void 0;
const database_1 = require("../../clients/database");
const utils_1 = require("./utils");
exports.default_prefixes = ['!', '~', 'p!'];
/**
 * Retrieve Guild Prefixes
 * Default: ['!', '~', 'p!']
 * @param guild_id interaction.guild.id
 * @returns ['!', '~', 'p!'] or more.
 */
function getPrefixes(guild_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield (0, database_1.databaseClient)('guild_settings')
            .where({
            guild_id: guild_id,
        })
            .select('prefixes')
            .first();
        if (data) {
            return JSON.parse(data.prefixes);
        }
        else {
            return exports.default_prefixes;
        }
    });
}
exports.getPrefixes = getPrefixes;
/**
 * Update a Guild's Prefixes
 * @param guild_id
 * @param prefixes
 * @returns
 */
function updatePrefixes(guild_id, prefixes) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, database_1.databaseClient)('guild_settings')
            .where({
            guild_id: guild_id,
        })
            .update({
            prefixes: JSON.stringify(prefixes),
        });
    });
}
exports.updatePrefixes = updatePrefixes;
function set_prefix(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        let i = 0;
        const parse = yield (0, utils_1.parseArgs)([]);
        const prefixes = yield getPrefixes(interaction.guild.id);
        if (!parse.args[1] || (!parse.args[2] && parse.args[1] != 'default')) {
            yield interaction.reply('Not enough parameters. Example: `!prefix enable !`. Type `!prefix help` for more information.');
            return;
        }
        if (parse.args[1] == 'enable') {
            switch (parse.args[2]) {
                case '!':
                    if (!prefixes.includes('!')) {
                        prefixes.push('!');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                        yield interaction.reply('Successfully added `!` as a prefix. Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                    }
                    break;
                case '?':
                    if (!prefixes.includes('\\?')) {
                        prefixes.push('\\?');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                        yield interaction.reply('Successfully added `?` as a prefix.  Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                    }
                    break;
                case '~':
                    if (!prefixes.includes('~')) {
                        prefixes.push('~');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                        yield interaction.reply('Successfully added `~` as a prefix.  Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                    }
                    break;
                case 'p!':
                    if (!prefixes.includes('p!')) {
                        prefixes.push('p!');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                        yield interaction.reply('Successfully added `p!` as a prefix.  Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                    }
                    break;
                default:
                    yield interaction.reply('You can enable/disable these prefixes: ' + prefixes);
                    break;
            }
        }
        else if (parse.args[1] == 'disable') {
            switch (parse.args[2]) {
                case '!':
                    if (prefixes.includes('!') && prefixes.length > 1) {
                        for (i = 0; i < prefixes.length; i++) {
                            if (prefixes[i] === '!') {
                                prefixes.splice(i, 1);
                            }
                        }
                        yield interaction.reply('Successfully removed `!` as a prefix.  Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                    }
                    break;
                case '?':
                    if (prefixes.includes('\\?') && prefixes.length > 1) {
                        for (i = 0; i < prefixes.length; i++) {
                            if (prefixes[i] === '\\?') {
                                prefixes.splice(i, 1);
                            }
                        }
                        yield interaction.reply('Successfully removed `?` as a prefix.  Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                    }
                    break;
                case '~':
                    if (prefixes.includes('~') && prefixes.length > 1) {
                        for (i = 0; i < prefixes.length; i++) {
                            if (prefixes[i] === '~') {
                                prefixes.splice(i, 1);
                            }
                        }
                        yield interaction.reply('Successfully removed `~` as a prefix.  Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                    }
                    break;
                case 'p!':
                    if (prefixes.includes('p!') && prefixes.length > 1) {
                        for (i = 0; i < prefixes.length; i++) {
                            if (prefixes[i] === 'p!') {
                                prefixes.splice(i, 1);
                            }
                        }
                        yield interaction.reply('Successfully removed `p!` as a prefix.  Your prefixes are now: `' +
                            prefixes.join(' ') +
                            '`.');
                        yield updatePrefixes(interaction.guild.id, prefixes);
                    }
                    break;
                default:
                    yield interaction.reply('You can enable/disable these prefixes: ' + prefixes);
                    break;
            }
        }
        else if (parse.args[1] == 'default') {
            yield updatePrefixes(interaction.guild.id, exports.default_prefixes);
            yield interaction.reply('Successfully reset prefixes back to default: ' +
                exports.default_prefixes.join(', '));
        }
        else if (parse.args[1] == 'help') {
            yield interaction.reply('Enable/disable prefixes: `!prefix disable ~` or `!prefix enable p!`. By default SmokeyBot uses: `' +
                exports.default_prefixes.join(' ') +
                '`.');
        }
    });
}
exports.set_prefix = set_prefix;
