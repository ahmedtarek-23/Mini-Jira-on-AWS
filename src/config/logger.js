'use strict';

const { createLogger, format, transports } = require('winston');

const isProd = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: isProd ? 'info' : 'debug',
  format: isProd
    ? format.combine(format.timestamp(), format.json()) // CloudWatch picks up structured JSON from stdout
    : format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${message}${extra}`;
        })
      ),
  transports: [new transports.Console()],
});

module.exports = logger;
