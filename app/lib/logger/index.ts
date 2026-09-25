import {
  getLogger as getLogTapeLogger,
  type Logger as LogTapeLogger,
} from '@logtape/logtape';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';
type Meta = Record<string, unknown>;

export interface Logger {
  log(level: LogLevel, message: unknown, meta?: Meta): void;
  error(message: unknown, meta?: Meta): void;
  warn(message: unknown, meta?: Meta): void;
  info(message: unknown, meta?: Meta): void;
  debug(message: unknown, meta?: Meta): void;
  /** A child logger that adds `meta` to every line it logs. */
  with(meta: Meta): Logger;
}

// LogTape treats `{name}` in a message as a placeholder for a property; our messages (including
// the Shopify library's, which can contain JSON) are plain text, so braces are escaped.
function escape(message: string) {
  return message.replace(/[{}]/g, brace => brace + brace);
}

// A thin facade over LogTape (configured in ./config.ts) that keeps the call-site shape
// `logger.info(msg, meta)` / `logger.error(err)`, so the library can be swapped without touching
// callers.
function wrap(target: LogTapeLogger): Logger {
  function log(level: LogLevel, message: unknown, meta: Meta = {}) {
    const method = level === 'warn' ? 'warning' : level;
    if (message instanceof Error) {
      target[method](escape(message.message), { error: message, ...meta });
    } else {
      target[method](escape(String(message)), meta);
    }
  }

  return {
    log,
    error: (message, meta) => log('error', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    info: (message, meta) => log('info', message, meta),
    debug: (message, meta) => log('debug', message, meta),
    with: meta => wrap(target.with(meta)),
  };
}

/**
 * A logger for a LogTape category, e.g. `getLogger(['app', 'webhooks'])`. Only the `app` and
 * `shopify` roots are configured (./config.ts); anything logged under another root is dropped.
 */
export function getLogger(category: readonly [string, ...string[]]): Logger {
  return wrap(getLogTapeLogger(category));
}

const logger = wrap(getLogTapeLogger(['app']));

export default logger;
