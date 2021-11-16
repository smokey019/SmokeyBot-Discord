'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.getLogger = void 0;
const log4js_1 = __importDefault(require('log4js'));
const config_1 = require('../config');
log4js_1.default.configure({
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
const loggers = {};
const defaultLogger = '$default';
/**
 * Spawn a logger.
 * @param category Whatever you want to call the logger
 * @returns
 */
function getLogger(category = defaultLogger) {
  if (!loggers[category]) {
    loggers[category] = log4js_1.default.getLogger(
      category === defaultLogger ? undefined : category,
    );
    loggers[category].level =
      (0, config_1.getConfigValue)('LOG_LEVEL') || 'OFF';
  }
  return loggers[category];
}
exports.getLogger = getLogger;
