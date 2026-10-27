// Miku Monday Bot on Cloudflare Workers (replaces server.js on Zeabur).
//
//   POST /webhook        Telegram updates; checked against WEBHOOK_SECRET
//   cron 0 16 * * SUN    Monday 00:00 SGT: the Miku GIF to every subscribed chat
//   cron 0 16 * * *      00:00 SGT daily: hype message + song of the day
//   GET  /status         branded status page (thebooleanjulian-bot-core, Julian Unified UI)
//   GET  /healthz        bot-core health JSON; the bot-core fan-out gates on it
//   GET  /health, /api/health, /api/status, /api/chat-ids   same shapes monitors used before
//
// Subscribed chats live in D1 (table chats, see schema.sql) instead of an encrypted Redis blob.
// Commands and copy are unchanged from server.js. Shared plumbing comes from thebooleanjulian-bot-core
// (tracked at main), so a bot-core change reaches this bot through the canary-gated fan-out.

import { log, api, verifyWebhook, parseCommand, healthz, statusPage, serveBrand } from 'thebooleanjulian-bot-core';
import { sgtNow, nextMikuMonday, formatSgtDate, buildDailyHypeMessage } from './hype.js';
import songs from './songs.json' with { type: 'json' };

const GIF_CAPTION = 'Happy Miku Monday! 🎉\nHave a great week with Hatsune Miku! 🎵';

// ── storage ────────────────────────────────────────────────────────────────
const db = {
  add: async (env, id) => (await env.DB.prepare('INSERT OR IGNORE INTO chats (chat_id) VALUES (?)').bind(String(id)).run()).meta.changes > 0,
  remove: async (env, id) => (await env.DB.prepare('DELETE FROM chats WHERE chat_id = ?').bind(String(id)).run()).meta.changes > 0,
  has: async (env, id) => Boolean(await env.DB.prepare('SELECT 1 FROM chats WHERE chat_id = ?').bind(String(id)).first()),
  count: async (env) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM chats').first()).n,
  all: async (env) => (await env.DB.prepare('SELECT chat_id FROM chats').all()).results.map((r) => r.chat_id)
};

const mask = (id) => {
  const s = String(id);
  return s.length > 4 ? '*'.repeat(s.length - 4) + s.slice(-4) : s;
};

const send = (env, chatId, text) =>
  api(env, 'sendMessage', { chat_id: chatId, text }).catch((err) => log.error('sendMessage failed', { chat: mask(chatId), error: err.message }));

// ── commands ───────────────────────────────────────────────────────────────
async function handleCommand(env, chatId, text, isChannel) {
  if (await db.add(env, chatId)) log.info('new chat registered', { chat: mask(chatId) });

  const cmd = parseCommand(text, env.BOT_USERNAME);
  if (!cmd) return;
  const count = await db.count(env);
  const nextDate = formatSgtDate(nextMikuMonday());
  const { day, time } = sgtNow();

  switch (cmd.name) {
    case 'start':
      return send(env, chatId, isChannel
        ? `✅ Miku Monday Bot registered!\n\nI'll send a Hatsune Miku GIF every Monday at 12:00 AM.\n\nChannels subscribed: ${count}`
        : `👋 Hello! I'm the Miku Monday Bot!\n\nI'll send a Hatsune Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC).\n\nType /help to see all available commands.`);

    case 'help':
      return send(env, chatId, isChannel
        ? `🤖 Miku Monday Bot Help 🤖

I automatically send a Hatsune Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC) to all channels I'm added to.
I also send daily hype messages at 12:00 AM GMT+8 to build anticipation for Miku Monday!

Available Commands:
/start - Register this channel/chat with the bot
/help - Show this help message
/status - Show bot status and next scheduled post
/countdown - Show time remaining until next Miku Monday
/today - Show today's daily hype message
/unsubscribe - Remove this channel from bot subscriptions
/feedback - Send feedback to the developer`
        : `I'm Miku Monday Bot! 🎵

Commands:
/start - Welcome message
/help - This help message
/status - Show subscription status
/countdown - Time until next Miku Monday
/today - Show today's daily hype message
/feedback - Send feedback to the developer
/listchannels - List subscribed channels (dev only)

I'll automatically send a Miku GIF every Monday at 12:00 AM to all channels I'm added to.`);

    case 'status':
      return send(env, chatId, isChannel
        ? `📊 Miku Monday Bot Status 📊

Current time (GMT+8): ${day}, ${time}

I'll automatically send a Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC) to all channels I'm added to.

Channels subscribed: ${count}
Next scheduled post: Monday 12:00 AM GMT+8 (${nextDate})`
        : `📊 Miku Monday Bot Status

Channels subscribed: ${count}
Next scheduled post: Monday 12:00 AM (${nextDate})

Visit ${env.PUBLIC_URL}/status for detailed status information.`);

    case 'countdown': {
      const ms = nextMikuMonday() - Date.now();
      const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
      return send(env, chatId, `⏰ Countdown to next Miku Monday:\n    \nCurrent time (GMT+8): ${day}, ${time}\n\nTime remaining: ${d} days, ${h} hours, ${m} minutes, ${s} seconds`);
    }

    case 'today':
      return send(env, chatId, buildDailyHypeMessage({ songs, channelCount: count, publicUrl: env.PUBLIC_URL }));

    case 'feedback':
      if (!cmd.args) {
        return send(env, chatId, `📬 Feedback for Miku Monday Bot:\n\nPlease send your feedback, bug reports, or suggestions to @JulianC97 on Telegram.\n\nYou can also type your message after /feedback and I'll forward it to the developer!`);
      }
      await send(env, chatId, `Thank you for your feedback! I've forwarded your message to the developer.`);
      if (env.DEVELOPER_CHAT_ID) {
        return send(env, env.DEVELOPER_CHAT_ID, `📬 New feedback received:\n\nFrom ${isChannel ? 'channel' : 'chat'}: ${chatId}\nMessage: ${cmd.args}`);
      }
      return log.info('feedback received, DEVELOPER_CHAT_ID not set');

    case 'listchannels': {
      if (env.DEVELOPER_CHAT_ID && String(chatId) === String(env.DEVELOPER_CHAT_ID)) {
        const ids = await db.all(env);
        const list = ids.map((id) => `• ${String(id).slice(-4).padStart(String(id).length, '*')}`).join('\n') || 'No channels subscribed';
        return send(env, chatId, `📋 Subscribed Channels:\n\n${list}\n\nTotal: ${ids.length} channels`);
      }
      return send(env, chatId, `🔐 This command is restricted to the bot developer only.\n\n🔒 Privacy Notice: Channel information is protected and masked even from the developer.\nOnly the last 4 digits of channel IDs are visible (e.g., ********1234).`);
    }

    case 'unsubscribe':
      if (!isChannel) {
        return send(env, chatId, `❌ Unsubscribe Error

You can only unsubscribe channels from the bot, not private chats.

To remove the bot from a channel:
1. Go to your channel settings
2. Select "Administrators"
3. Remove the Miku Monday Bot as an administrator

If you wish to stop receiving direct messages, you can simply ignore them or block the bot.`);
      }
      // The chat was registered at the top of this function, as in server.js, so this always removes it.
      await db.remove(env, chatId);
      return send(env, chatId, `✅ Successfully Unsubscribed

This channel has been unsubscribed from Miku Monday Bot.
You will no longer receive Miku GIFs or daily hype messages here.

To resubscribe in the future, simply send /start@itsmikumondaybot`);
  }
  // No default reply, to avoid spamming channels.
}

async function handleUpdate(update, env) {
  const msg = update.message || update.channel_post;
  if (!msg?.entities?.some((e) => e.type === 'bot_command')) return; // commands only
  try {
    await handleCommand(env, msg.chat.id, msg.text, Boolean(update.channel_post));
  } catch (err) {
    log.error('update failed', { update_id: update.update_id, error: err.message });
  }
}

// ── scheduled posts ────────────────────────────────────────────────────────
async function broadcast(env, label, sendOne) {
  const ids = await db.all(env);
  const results = await Promise.allSettled(ids.map(sendOne));
  const failed = results.filter((r) => r.status === 'rejected');
  failed.forEach((r) => log.error(`${label} failed`, { error: r.reason?.message }));
  log.info(`${label} sent`, { ok: ids.length - failed.length, failed: failed.length });
}

// ── http ───────────────────────────────────────────────────────────────────
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const COMMANDS = [
  ['/start', 'Register this chat or channel'],
  ['/help', 'Show help'],
  ['/status', 'Subscription info and next scheduled post'],
  ['/countdown', 'Time until the next Miku Monday'],
  ['/today', "Today's hype message"],
  ['/unsubscribe', 'Remove this channel'],
  ['/feedback', 'Send feedback to the developer']
];

async function dbCheck(env) {
  try {
    return { checks: { d1: 'ok' }, count: await db.count(env) };
  } catch (err) {
    return { checks: { d1: `FAIL: ${err.message}` }, count: null };
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    const brand = serveBrand(request);
    if (brand) return brand;
    if (pathname === '/healthz') {
      const { checks, count } = await dbCheck(env);
      return healthz(env, { checks, extra: { chats: count } });
    }
    if (pathname === '/status') {
      const { checks, count } = await dbCheck(env);
      const { day, time } = sgtNow();
      return statusPage(env, {
        name: 'Miku Monday Bot',
        username: '@itsmikumondaybot',
        icon: '🎵',
        description: 'A Hatsune Miku GIF every Monday at 12:00 AM GMT+8, plus a daily hype message and song of the day.',
        ok: Object.values(checks).every((v) => v === 'ok'),
        metrics: { 'Channels': count ?? '—', 'Now (GMT+8)': `${day.slice(0, 3)} ${time.slice(0, 5)}`, 'Next GIF': formatSgtDate(nextMikuMonday()).replace(/^Monday, /, 'Mon ') },
        commands: COMMANDS,
        sections: [{ title: 'Schedule', html: 'Miku GIF: <b>Monday 12:00 AM GMT+8</b><br/>Daily hype + song of the day: <b>every day 12:00 AM GMT+8</b>' }]
      });
    }

    if (pathname === '/webhook' && request.method === 'POST') {
      if (!verifyWebhook(request, env)) return new Response('forbidden', { status: 403 });
      const update = await request.json().catch(() => null);
      if (update) ctx.waitUntil(handleUpdate(update, env));
      return new Response('ok');
    }
    if (pathname === '/health') return new Response('Miku Monday Bot is running!');
    if (pathname === '/api/health') {
      try {
        return json({ online: true, timestamp: new Date().toISOString(), chatIdsCount: await db.count(env), storage: { type: 'd1', ok: true }, telegram: { mode: 'webhook' } });
      } catch (err) {
        return json({ online: false, error: err.message, timestamp: new Date().toISOString() }, 500);
      }
    }
    if (pathname === '/api/status') {
      const { day, time } = sgtNow();
      return json({
        online: true,
        channelCount: await db.count(env),
        nextPost: 'Monday at 12:00 AM GMT+8',
        dailyHype: '12:00 AM GMT+8 with day-specific content',
        currentTime: { day, time, timezone: 'GMT+8' },
        timezone: 'UTC',
        timestamp: new Date().toISOString(),
        serverStartTime: env.CF_VERSION_METADATA?.timestamp || null
      });
    }
    if (pathname === '/api/chat-ids') {
      const ids = await db.all(env);
      return json({ count: ids.length, maskedIds: ids.map(mask), timestamp: new Date().toISOString() });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === '0 16 * * SUN') {
      const gif = `${env.PUBLIC_URL}/its-miku-monday.gif`;
      await broadcast(env, 'miku gif', (chat_id) => api(env, 'sendAnimation', { chat_id, animation: gif, caption: GIF_CAPTION }));
    }
    if (event.cron === '0 16 * * *') {
      const text = buildDailyHypeMessage({ songs, channelCount: await db.count(env), publicUrl: env.PUBLIC_URL });
      await broadcast(env, 'daily hype', (chat_id) => api(env, 'sendMessage', { chat_id, text }));
    }
  }
};
