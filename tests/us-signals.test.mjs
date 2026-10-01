import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSignals } from '../ui/us-signals.mjs';
import { signalsFixture } from './us-signals-fixture.mjs';
const url = new URL('http://localhost/api/us/signals?limit=50&offset=0');
const query = { limit: 50, offset: 0 };
test('contract, source, page, score nulls and record quality remain distinct', () => {
  const data = readSignals(signalsFixture(url), query);
  assert.equal(data.items.length, 50); assert.equal(data.page.nextOffset, 50);
  assert.equal(data.items[0].scores.investment.value, null); assert.equal(data.items[0].qualityFlags.length, 2);
  for (const state of ['EMPTY', 'UNAVAILABLE', 'ERROR']) assert.equal(readSignals(signalsFixture(url, state), query).dataState, state);
});
test('malformed transport and fake score origins fail closed', () => {
  for (const mutate of [d => d.contractVersion = 2, d => d.page.nextOffset = 999, d => d.dataState = 'STALE',
    d => d.items[0].scores.signal.origin = 'dashboard_computed', d => d.items[1].signalId = d.items[0].signalId,
    d => d.page.limit = 100, d => d.items[0].listedBuyerCount = 10]) {
    const data = signalsFixture(url); mutate(data); assert.throws(() => readSignals(data, query));
  }
});
