// node --test   (Node 22+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sgtDay, sgtNow, nextMikuMonday, formatSgtDate, buildDailyHypeMessage } from '../hype.js';

const at = (iso) => new Date(iso);

test('sgtDay uses Singapore time, not UTC', () => {
  assert.equal(sgtDay(at('2026-11-01T15:59:00Z')), 0); // Sun 23:59 SGT
  assert.equal(sgtDay(at('2026-11-01T16:00:00Z')), 1); // Mon 00:00 SGT
});

test('sgtNow shows the real SGT time (the old server showed +8h on top)', () => {
  assert.deepEqual(sgtNow(at('2026-10-27T01:30:00Z')), { day: 'Tuesday', time: '09:30:00' });
});

test('nextMikuMonday is the next Sunday 16:00 UTC strictly after now', () => {
  assert.equal(nextMikuMonday(at('2026-10-27T01:30:00Z')).toISOString(), '2026-11-01T16:00:00.000Z'); // Tue
  assert.equal(nextMikuMonday(at('2026-11-01T15:00:00Z')).toISOString(), '2026-11-01T16:00:00.000Z'); // Sun, before
  assert.equal(nextMikuMonday(at('2026-11-01T16:00:00Z')).toISOString(), '2026-11-08T16:00:00.000Z'); // exactly at
});

test('formatSgtDate names the Monday', () => {
  assert.equal(formatSgtDate(nextMikuMonday(at('2026-10-27T01:30:00Z'))), 'Monday, November 2, 2026');
});

test('daily hype message carries a song, the count and the public URL', () => {
  const msg = buildDailyHypeMessage({
    songs: [{ title: 'Ievan Polka', artist: 'Otomania', url: 'https://open.spotify.com/track/x' }],
    channelCount: 16,
    publicUrl: 'https://miku-monday.thebooleanjulian.dev',
    now: at('2026-11-01T16:30:00Z')
  });
  assert.match(msg, /MIKU MONDAY|Miku Monday/);
  assert.match(msg, /Ievan Polka by Otomania/);
  assert.match(msg, /Channels subscribed: 16/);
  assert.match(msg, /miku-monday\.thebooleanjulian\.dev\/status/);
  assert.doesNotMatch(msg, /zeabur/);
});
