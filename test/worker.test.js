// node --test   Routes of worker.js against an in-memory stand-in for D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';

// Stand-in for the postgres tagged-template client (bot-core's withDb accepts it as env.SQL).
function fakeSql(ids = ['-1001', '-1002']) {
  const rows = new Set(ids);
  return async (strings, ...values) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    const id = values[0];
    if (q.startsWith('insert')) { if (rows.has(id)) return []; rows.add(id); return [{ chat_id: id }]; }
    if (q.startsWith('delete')) return rows.delete(id) ? [{ chat_id: id }] : [];
    if (q.includes('count(*)')) return [{ n: rows.size }];
    if (q.startsWith('select 1')) return rows.has(id) ? [{ '?column?': 1 }] : [];
    if (q.startsWith('select chat_id')) return [...rows].map((chat_id) => ({ chat_id }));
    throw new Error(`unexpected query: ${q}`);
  };
}

const env = () => ({ SQL: fakeSql(), BOT_CORE_SHA: 'abc1234', PUBLIC_URL: 'https://miku-monday.thebooleanjulian.dev', ASSETS: { fetch: () => new Response('asset') } });
const get = (path, e = env()) => worker.fetch(new Request(`https://x${path}`), e, { waitUntil() {} });

test('/healthz passes with Postgres reachable and reports the bot-core sha', async () => {
  const res = await get('/healthz');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'pass');
  assert.equal(body.bot_core.sha, 'abc1234');
  assert.equal(body.chats, 2);
});

test('/healthz fails when Postgres is unreachable, without leaking the URL', async () => {
  const e = env();
  e.SQL = () => Promise.reject(new Error('connect failed postgres://u:secret@h/db'));
  const res = await get('/healthz', e);
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /secret/);
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
