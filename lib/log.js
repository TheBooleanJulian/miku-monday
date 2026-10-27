// Structured logging that never prints a bot token.
// The JS counterpart of bot-core's setup_logging(): Telegram tokens leak through request URLs
// (api.telegram.org/bot<token>/...) and error messages, so every line is scrubbed before output.

// Lookarounds, not \b: in ".../bot123456:AA..." the digits follow "bot" with no word boundary.
const TOKEN = /(?<!\d)\d{6,}:[A-Za-z0-9_-]{30,}(?![A-Za-z0-9_-])/g;

export function redact(value) {
  return String(value).replace(TOKEN, '<bot-token>');
}

function emit(level, msg, fields) {
  const line = { level, msg: redact(msg) };
  for (const [k, v] of Object.entries(fields || {})) {
    line[k] = typeof v === 'string' ? redact(v) : v;
  }
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}

export const log = {
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields)
};
