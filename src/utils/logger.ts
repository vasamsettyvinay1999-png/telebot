import pino from 'pino';
import { env } from '../config/env.js';

const isProd = env.NODE_ENV === 'production';

export const loggerOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: 'orion-path' },
  redact: {
    paths: ['*.password', '*.token', 'body.message.text'],
    censor: '[REDACTED]',
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', singleLine: true },
        },
      }),
};

export const logger = pino(loggerOptions);

