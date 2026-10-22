import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTriggered, inCooldown, pickPair, targetPrice } from '../src/lib.js';

test('above / below', () => {
  assert.ok(isTriggered({ type: 'above', value: 0.00003 }, 0.0000312));
  assert.ok(!isTriggered({ type: 'above', value: 0.00003 }, 0.0000299));
  assert.ok(isTriggered({ type: 'below', value: 1 }, 0.99));
});

test('percent rules use basePrice', () => {
  const up = { type: 'pct_up', value: 20, basePrice: 1 };
  assert.equal(targetPrice(up), 1.2);
  assert.ok(isTriggered(up, 1.2));
  assert.ok(!isTriggered(up, 1.19));
  assert.ok(isTriggered({ type: 'pct_down', value: 15, basePrice: 2 }, 1.7));
});

test('invalid rules never trigger', () => {
  assert.ok(!isTriggered({ type: 'pct_up', value: 20 }, 100)); // no basePrice
  assert.ok(!isTriggered({ type: 'above', value: -1 }, 100));
  assert.ok(!isTriggered({ type: 'above', value: 1 }, NaN));
});

test('cooldown', () => {
  const now = Date.parse('2026-01-02T00:00:00Z');
  assert.ok(inCooldown({}, '2026-01-01T12:00:00Z', now)); // 12h < 24h default
  assert.ok(!inCooldown({}, '2026-01-01T00:00:00Z', now)); // exactly 24h
  assert.ok(!inCooldown({}, undefined, now));
  assert.ok(!inCooldown({ cooldownHours: 1 }, '2026-01-01T12:00:00Z', now));
});

test('editing a rule after its last alert lifts the cooldown', () => {
  const now = Date.parse('2026-01-02T00:00:00Z');
  const last = '2026-01-01T23:00:00Z'; // 1h ago: normally still quiet
  assert.ok(inCooldown({}, last, now));
  assert.ok(!inCooldown({ updatedAt: '2026-01-01T23:30:00Z' }, last, now));
  assert.ok(inCooldown({ updatedAt: '2026-01-01T22:00:00Z' }, last, now)); // edited before the alert
});

test('pickPair chooses most liquid matching pair', () => {
  const pairs = [
    { baseToken: { address: 'AAA' }, priceUsd: '1', liquidity: { usd: 10 } },
    { baseToken: { address: 'aaa' }, priceUsd: '2', liquidity: { usd: 500 } },
    { baseToken: { address: 'BBB' }, priceUsd: '3', liquidity: { usd: 9999 } },
  ];
  assert.equal(pickPair(pairs, 'AAA').priceUsd, '2');
  assert.equal(pickPair(pairs, 'CCC'), null);
});
