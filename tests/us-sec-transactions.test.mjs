import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSecTransactions } from '../ui/us-sec-transactions.mjs';
import { secFixture } from './us-sec-transactions-fixture.mjs';
const url = new URL('http://localhost/api/us/sec-transactions?limit=50&offset=0'), query = { limit: 50, offset: 0 };
test('SEC facts retain owners, nullable fields, non-P, derivative and amendment flags without scores', () => {
  const data = readSecTransactions(secFixture(url), query);
  assert.equal(data.items.length, 50); assert.equal(data.items[0].candidateOpenMarketPurchase, true);
  assert.equal(data.items[1].transactionCode, 'S'); assert.equal(data.items[2].insiderExecutionPrice, null);
  assert.equal(data.items[2].securityType, 'derivative'); assert.equal(data.items[0].reportingOwners.length, 2);
  assert.equal('scores' in data.items[0], false); assert.match(data.items[2].qualityFlags.join(), /AMENDMENT/);
  for (const state of ['EMPTY', 'UNAVAILABLE', 'ERROR']) assert.equal(readSecTransactions(secFixture(url,state),query).dataState, state);
});
test('invalid identities, pages, booleans, owners and footnotes fail closed', () => {
  for (const mutate of [d => d.contractVersion = 2, d => d.page.nextOffset = 999, d => d.dataState = 'STALE', d => d.sources[0].sourceId = 'insider-reports',
    d => d.items[0].signalId = 'report:QA', d => d.items[1].signalId = d.items[0].signalId, d => d.items[0].candidateOpenMarketPurchase = 'true',
    d => d.items[0].isDirect = 0, d => d.items[0].shares = '100', d => d.items[0].reportingOwners[0].roles = 'director',
    d => d.items[0].footnotes[0].text = false, d => d.items[0].scores = {}]) {
    const data = secFixture(url); mutate(data); assert.throws(() => readSecTransactions(data,query));
  }
});
