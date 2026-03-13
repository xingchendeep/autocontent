type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  // Output as single-line JSON for easy parsing in Vercel / any log aggregator
  const out = JSON.stringify(entry);
  if (level === 'error') {
    console.error(out);
  } else if (level === 'warn') {
    console.warn(out);
  } else {
    console.log(out);
  }
}

export const logger = {
  info:  (message: string, fields?: Record<string, unknown>) => log('info',  message, fields),
  warn:  (message: string, fields?: Record<string, unknown>) => log('warn',  message, fields),
  error: (message: string, fields?: Record<string, unknown>) => log('error', message, fields),
};
