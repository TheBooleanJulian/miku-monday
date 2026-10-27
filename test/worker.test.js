// node --test   Routes of worker.js against an in-memory stand-in for D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';

function fakeD1(ids = ['-1001', '-1002']) {
  const rows = new Set(ids);
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind: (...a) => { args = a; return stmt; },
        async run() {
          if (sql.startsWith('INSERT')) { const had = rows.has(args[0]); rows.add(args[0]); return { meta: { changes: had ? 0 : 1 } }; }
          if (sql.startsWith('DELETE')) { const had = rows.delete(args[0]); return { meta: { changes: had ? 1 : 0 } }; }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (sql.includes('COUNT')) return { n: rows.size };
          return rows.has(args[0]) ? { 1: 1 } : null;
        },
        async all() { return { results: [...rows].map((chat_id) => ({ chat_id })) }; }
      };
      return stmt;
    }
  };
}

const env = () => ({ DB: fakeD1(), BOT_CORE_SHA: 'abc1234', PUBLIC_URL: 'https://miku-monday.thebooleanjulian.dev', ASSETS: { fetch: () => new Response('asset') } });
const get = (path, e = env()) => worker.fetch(new Request(`https://x${path}`), e, { waitUntil() {} });

test('/healthz passes with D1 reachable and reports the bot-core sha', async () => {
  const res = await get('/healthz');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'pass');
  assert.equal(body.bot_core.sha, 'abc1234');
  assert.equal(body.chats, 2);
});

test('/healthz fails when D1 is broken', async () => {
  const e = env();
  e.DB = { prepare() { throw new Error('d1 down'); } };
  assert.equal((await get('/healthz', e)).status, 500);
});

test('/status is the branded bot-core page with the channel count', async () => {
  const html = await (await get('/status')).text();
  assert.match(html, /Miku Monday Bot/);
  assert.match(html, /--cyan/);
  assert.match(html, />2<\/span><span class="metric-label">Channels/);
});

test('/brand/tokens.css is served for the landing page', async () => {
  assert.match(await (await get('/brand/tokens.css')).text(), /--magenta/);
});

test('/api/status keeps the shape older monitors used', async () => {
  const body = await (await get('/api/status')).json();
  for (const k of ['online', 'channelCount', 'nextPost', 'currentTime', 'serverStartTime']) assert.ok(k in body, k);
});

test('/webhook rejects requests without the secret', async () => {
  const res = await worker.fetch(new Request('https://x/webhook', { method: 'POST', body: '{}' }), { ...env(), WEBHOOK_SECRET: 's' }, { waitUntil() {} });
  assert.equal(res.status, 403);
});
