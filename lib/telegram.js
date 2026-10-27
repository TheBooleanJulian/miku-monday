// Minimal Bot API client and webhook check. fetch only, no SDK, so it runs on
// Cloudflare Workers and (minus the env lookups) on Telegram serverless.

import { log, redact } from './log.js';

export class TelegramError extends Error {}

export async function api(env, method, params = {}) {
  if (!env.BOT_TOKEN) throw new TelegramError('BOT_TOKEN is not set');
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    const err = new TelegramError(redact(`${method} failed: ${res.status} ${body.description || ''}`));
    err.status = res.status;
    throw err;
  }
  return body.result;
}

export const reply = (env, message, text, extra = {}) =>
  api(env, 'sendMessage', { chat_id: message.chat.id, text, parse_mode: 'HTML', ...extra });

// Constant-time comparison so the secret can't be guessed byte by byte from timing.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Telegram sends the secret_token given to setWebhook in this header on every update.
export function verifyWebhook(request, env) {
  if (!env.WEBHOOK_SECRET) {
    log.warn('WEBHOOK_SECRET not set; rejecting webhook');
    return false;
  }
  return safeEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', env.WEBHOOK_SECRET);
}
