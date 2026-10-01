import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactTicker, readTickerDetail, TICKER_DETAIL_TIMEOUT_MS } from '../ui/us-ticker-detail.mjs';
import { tickerFixture } from './us-ticker-detail-fixture.mjs';
const query = { ticker: 'QA0', signalsLimit: 50, signalsOffset: 0, secLimit: 50, secOffset: 0 };
const url = () => new URL(`http://fixture/?${new URLSearchParams(query)}`);
test('required exact ticker matches the existing ASCII bounds; composite deadline covers both source budgets', () => {
  assert.equal(exactTicker(' brk.b '), 'BRK.B'); assert.equal(exactTicker('Brk-B'), 'BRK-B');
  assert.equal(exactTicker('a123456789012345'), 'A123456789012345');
  for (const bad of ['', ' ', null, '.COO', '-COO', 'a b', '臺積電', 'abcdefghijklmnopq', 'C:\\private']) assert.throws(() => exactTicker(bad));
  assert.equal(TICKER_DETAIL_TIMEOUT_MS, 75000);
});
const states = ['READY', 'EMPTY', 'UNAVAILABLE', 'ERROR'];
const expected = [['READY','READY','PARTIAL','PARTIAL'],['READY','EMPTY','PARTIAL','PARTIAL'],['PARTIAL','PARTIAL','UNAVAILABLE','ERROR'],['PARTIAL','PARTIAL','ERROR','ERROR']];
for (const [i,a] of states.entries()) for (const [j,b] of states.entries()) test(`aggregate ${a}+${b} retains separate normalized envelopes`, () => {
  const fixture = tickerFixture(url(),a,b), result = readTickerDetail(fixture,query);
  assert.equal(result.dataState,expected[i][j]); assert.deepEqual(result.sections,fixture.sections);
  assert.equal('items' in result,false); assert.equal('scores' in result,false);
});
test('malformed source alone becomes safe ERROR and preserves the valid other source', () => {
  for (const failed of ['signals','secTransactions']) {
    const good = failed === 'signals' ? 'secTransactions' : 'signals', fixture = tickerFixture(url());
    fixture.sections[failed].items[0].ticker = 'OTHER';
    const result = readTickerDetail(fixture,query);
    assert.equal(result.dataState,'PARTIAL'); assert.equal(result.sections[failed].dataState,'ERROR');
    assert.deepEqual(result.sections[good],fixture.sections[good]);
    assert.equal(JSON.stringify(result).includes('OTHER'),false);
  }
});
test('independent pagination and metadata/identities never merge or auto-load extra rows', () => {
  const q = { ...query, signalsOffset: 50, secLimit: 10, secOffset: 10 }, u = new URL(`http://fixture/?${new URLSearchParams(q)}`);
  const result = readTickerDetail(tickerFixture(u),q);
  assert.equal(result.sections.signals.items.length,1); assert.equal(result.sections.secTransactions.items.length,10);
  assert.equal(result.sections.signals.page.hasMore,false); assert.equal(result.sections.secTransactions.page.nextOffset,20);
  assert.notEqual(result.sections.signals.observedAt,result.sections.secTransactions.observedAt);
  assert.match(result.sections.signals.items[0].signalId,/^report:/); assert.match(result.sections.secTransactions.items[0].signalId,/^sec:/);
  assert.equal('scores' in result.sections.secTransactions.items[0],false);
});
test('aggregate-format/state mismatches are rejected safely', () => {
  for (const mutate of [p=>p.ticker='OTHER',p=>p.dataState='PARTIAL',p=>p.observedAt='bad',p=>p.contractVersion=2]) {
    const fixture = tickerFixture(url()); mutate(fixture); assert.throws(()=>readTickerDetail(fixture,query));
  }
});
