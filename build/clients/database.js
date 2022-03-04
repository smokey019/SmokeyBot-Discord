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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuildSettingsTable = exports.putGuildSettings = exports.getUser = exports.getUserDBCount = exports.getGuildSettings = exports.loadGlobalSetting = exports.databaseClient = void 0;
const knex_1 = __importDefault(require("knex"));
const config_1 = require("../config");
const MonsterUser_1 = require("../models/MonsterUser");
const logger_1 = require("./logger");
const logger = (0, logger_1.getLogger)('Database');
exports.databaseClient = (0, knex_1.default)({
    client: 'mysql2',
    connection: {
        database: (0, config_1.getConfigValue)('DB_DATABASE'),
        host: (0, config_1.getConfigValue)('DB_HOST'),
        port: parseInt((0, config_1.getConfigValue)('DB_PORT')),
        password: (0, config_1.getConfigValue)('DB_PASSWORD'),
        user: (0, config_1.getConfigValue)('DB_USER'),
    },
    pool: { min: 0, max: 7 },
    log: {
        warn(message) {
            console.error(message);
        },
        error(message) {
            console.error(message);
        },
        deprecate(message) {
            console.error(message);
        },
        debug(message) {
            logger.debug(message);
        },
    },
});
/**
 * Load setting from DB
 * @param which
 * @returns
 */
function loadGlobalSetting(which) {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield (0, exports.databaseClient)('global_smokeybot_settings').first();
        return settings[which];
    });
}
exports.loadGlobalSetting = loadGlobalSetting;
/**
 * Pulls guild settings from database. Creates new settings if needed.
 *
 * @param Message Discord Message Object
 */
function getGuildSettings(guild) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild_settings = yield (0, exports.databaseClient)(exports.GuildSettingsTable)
            .select()
            .where('guild_id', guild.id)
            .first();
        if (!guild_settings) {
            const insert = yield (0, exports.databaseClient)(exports.GuildSettingsTable).insert({
                guild_id: guild.id,
                smokemon_enabled: 0,
            });
            if (insert) {
                logger.info(`Created new guild settings for ${guild.name}.`);
                const guild_settings = yield (0, exports.databaseClient)(exports.GuildSettingsTable)
                    .select()
                    .where('guild_id', guild.id)
                    .first();
                if (guild_settings) {
                    return guild_settings;
                }
                else {
                    return undefined;
                }
            }
            else {
                return undefined;
            }
        }
        else {
            return guild_settings;
        }
    });
}
exports.getGuildSettings = getGuildSettings;
function getUserDBCount() {
    return __awaiter(this, void 0, void 0, function* () {
        const user_settings = yield (0, exports.databaseClient)(MonsterUser_1.MonsterUserTable).select();
        return user_settings.length;
    });
}
exports.getUserDBCount = getUserDBCount;
/**
 * WIP
 * @param uid
 */
function getUser(uid) {
    return __awaiter(this, void 0, void 0, function* () {
        const user_settings = yield (0, exports.databaseClient)(MonsterUser_1.MonsterUserTable)
            .select()
            .where('uid', uid);
        return user_settings[0];
    });
}
exports.getUser = getUser;
/**
 * Inserts new GuildSettings into database.
 *
 * @param message Discord Message Object
 */
function putGuildSettings(interaction) {
    return __awaiter(this, void 0, void 0, function* () {
        const insert = interaction.guild != null
            ? yield (0, exports.databaseClient)(exports.GuildSettingsTable).insert({
                guild_id: interaction.guild.id,
                smokemon_enabled: 0,
            })
            : [];
        logger.info(`Created new guild settings for ${interaction.guild.name}.`);
        console.log(insert);
        return insert[0];
    });
}
exports.putGuildSettings = putGuildSettings;
exports.GuildSettingsTable = 'guild_settings';
