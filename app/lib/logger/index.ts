type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface Logger {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
  error(message: unknown, meta?: Record<string, unknown>): void;
  warn(message: unknown, meta?: Record<string, unknown>): void;
  info(message: unknown, meta?: Record<string, unknown>): void;
  debug(message: unknown, meta?: Record<string, unknown>): void;
}

// winston (used previously) pulls in Node's classic `stream`/`util.inherits` machinery, which
// breaks under the Workers runtime even with the `nodejs_compat` flag (`The "superCtor.prototype"
// property must be of type object. Received undefined`, thrown from deep inside
// readable-stream/winston-transport). Workers' `console.*` methods are themselves structured-log
// sinks (they show up as JSON in `wrangler tail`/the dashboard), so a thin wrapper that shapes the
// same `{ level, message, ...meta }` payload winston's `format.json()` produced is enough to keep
// today's call sites (`logger.error(err)`, `logger.log(level, msg)`, `logger.info(msg, meta)`)
// working without change.
function log(
  level: LogLevel,
  message: unknown,
  meta?: Record<string, unknown>,
): void {
  const payload =
    message instanceof Error
      ? { level, message: message.message, stack: message.stack, ...meta }
      : { level, message, ...meta };

  const serialized = JSON.stringify(payload);

  /* oxlint-disable no-console -- this module is the app's sanctioned console sink */
  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
  /* oxlint-enable no-console */
}

const logger: Logger = {
  log: (level, message, meta) => log(level, message, meta),
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta),
};

export default logger;
