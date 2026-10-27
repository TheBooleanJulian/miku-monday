// node --test   (Node 20+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { redact } from '../lib/log.js';
import { parseCommand, createRouter } from '../lib/router.js';
import { isAdmin, adminOnly } from '../lib/admin.js';
import { verifyWebhook } from '../lib/telegram.js';

const TOKEN = '8734475451:AAFakeTokenForTestsOnly_abcdefghijk';

test('redact removes bot tokens from text and URLs', () => {
  assert.equal(redact(`GET https://api.telegram.org/bot${TOKEN}/getMe`), 'GET https://api.telegram.org/bot<bot-token>/getMe');
  assert.equal(redact('no secrets here'), 'no secrets here');
});

test('parseCommand handles args, bot mentions and non-commands', () => {
  assert.deepEqual(parseCommand('/Start hello there'), { name: 'start', args: 'hello there' });
  assert.deepEqual(parseCommand('/start@MyBot', 'mybot'), { name: 'start', args: '' });
  assert.equal(parseCommand('/start@OtherBot', 'mybot'), null);
  assert.equal(parseCommand('hello'), null);
});

test('router dispatches commands, callbacks and plain messages', async () => {
  const seen = [];
  const route = createRouter({
    commands: { ping: (ctx) => seen.push(['ping', ctx.args]) },
    callbacks: { 'menu:': (ctx) => seen.push(['cb', ctx.data]) },
    onMessage: (ctx) => seen.push(['msg', ctx.message.text])
  });
  await route({ message: { text: '/ping 1', chat: { id: 1 } } }, {});
  await route({ callback_query: { data: 'menu:open', from: { id: 1 } } }, {});
  await route({ message: { text: 'hi', chat: { id: 1 } } }, {});
  assert.deepEqual(seen, [['ping', '1'], ['cb', 'open'], ['msg', 'hi']]);
});

test('router swallows handler errors so Telegram does not retry forever', async () => {
  const route = createRouter({ commands: { boom: () => { throw new Error('kaput'); } } });
  await assert.doesNotReject(route({ update_id: 1, message: { text: '/boom', chat: { id: 1 } } }, {}));
});

test('admin checks and adminOnly', async () => {
  const env = { OWNER_TELEGRAM_ID: '11, 22' };
  assert.ok(isAdmin(env, 22));
  assert.ok(!isAdmin(env, 33));
  assert.ok(!isAdmin({}, 11));
  let called = false;
  await adminOnly(() => { called = true; })({ env, from: { id: 33 } });
  assert.equal(called, false);
});

test('verifyWebhook needs the exact secret header', () => {
  const req = (h) => new Request('https://x/webhook', { method: 'POST', headers: h });
  const env = { WEBHOOK_SECRET: 's3cret' };
  assert.ok(verifyWebhook(req({ 'X-Telegram-Bot-Api-Secret-Token': 's3cret' }), env));
  assert.ok(!verifyWebhook(req({ 'X-Telegram-Bot-Api-Secret-Token': 'wrong!' }), env));
  assert.ok(!verifyWebhook(req({}), env));
  assert.ok(!verifyWebhook(req({ 'X-Telegram-Bot-Api-Secret-Token': 's3cret' }), {}));
});

