import knex from 'knex';

import { getConfigValue } from '../config';
import { getLogger } from './logger';

const logger = getLogger('Database');

export const databaseClient = knex({
  client: 'mysql',
  connection: {
    database: getConfigValue('DB_DATABASE'),
    host: getConfigValue('DB_HOST'),
    password: getConfigValue('DB_PASSWORD'),
    user: getConfigValue('DB_USER'),
  },
  log: {
    debug: logger.debug,
    deprecate: logger.trace,
    error: logger.error,
    warn: logger.warn,
  },
});
