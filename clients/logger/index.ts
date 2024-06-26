import log4js from 'log4js';

log4js.configure({
  appenders: {
    out: {
      type: 'stdout',
      layout: {
        type: 'pattern',
        pattern: '%[[%d{MM/dd/yyyy - hh:mm:ss.SSS}] [%p] [%c]%] - %m%n',
      },
    },
  },
  categories: { default: { appenders: ['out'], level: 'info' } },
});

const loggers: { [category: string]: log4js.Logger } = {};

const defaultLogger = '$default';

/**
 * Spawn a logger.
 * @param category Whatever you want to call the logger
 * @returns
 */
export function getLogger(category = defaultLogger): log4js.Logger {
  if (!loggers[category]) {
    loggers[category] = log4js.getLogger(
      category === defaultLogger ? undefined : category,
    );

    loggers[category].level = process.env.LOG_LEVEL || 'OFF';
  }

  return loggers[category];
}
