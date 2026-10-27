// Routes one Telegram update to a handler. Replaces python-telegram-bot's
// CommandHandler / CallbackQueryHandler / MessageHandler wiring.
//
//   const route = createRouter({
//     commands: { start: (ctx) => ... },        // /start, /start@MyBot, /start args
//     callbacks: { 'menu:': (ctx) => ... },      // callback_data prefix
//     onMessage: (ctx) => ...,                   // any other message
//   });
//   await route(update, env, waitUntil);

import { log } from './log.js';

export function parseCommand(text, botUsername) {
  const m = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/.exec(text || '');
  if (!m) return null;
  if (m[2] && botUsername && m[2].toLowerCase() !== botUsername.toLowerCase()) return null; // addressed to another bot
  return { name: m[1].toLowerCase(), args: (m[3] || '').trim() };
}

export function createRouter({ commands = {}, callbacks = {}, onMessage, botUsername } = {}) {
  return async function route(update, env, waitUntil) {
    const message = update.message || update.edited_message || update.channel_post;
    const ctx = { update, env, message, waitUntil, from: message?.from || update.callback_query?.from };
    try {
      if (update.callback_query) {
        const data = update.callback_query.data || '';
        const prefix = Object.keys(callbacks).find((p) => data.startsWith(p));
        if (prefix) return await callbacks[prefix]({ ...ctx, query: update.callback_query, data: data.slice(prefix.length) });
        return;
      }
      if (!message) return;
      const cmd = parseCommand(message.text, botUsername || env.BOT_USERNAME);
      if (cmd && commands[cmd.name]) return await commands[cmd.name]({ ...ctx, args: cmd.args });
      if (onMessage) return await onMessage(ctx);
    } catch (err) {
      // Never let one bad update fail the webhook: Telegram would retry it forever.
      log.error('handler failed', { update_id: update.update_id, error: err.message });
    }
  };
}
