import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/monitor.js';

test('fires once, then stays quiet during cooldown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cpa-'));
  const rulesPath = join(dir, 'rules.json');
  const statePath = join(dir, 'state.json');
  await writeFile(rulesPath, JSON.stringify({ rules: [
    { id: 'r1', symbol: 'BONK', chainId: 'solana', tokenAddress: 'TOKEN1', type: 'above', value: 0.00003 },
    { id: 'r2', symbol: 'PEPE', chainId: 'ethereum', tokenAddress: '0xabc', type: 'below', value: 1 },
  ] }));

  process.env.NTFY_TOPIC = 'test-topic';
  const sent = [];
  const fetchImpl = async (url, opts) => {
    if (opts?.method === 'POST') {
      sent.push(JSON.parse(opts.body));
      return { ok: true };
    }
    const body = url.includes('/solana/')
      ? [{ baseToken: { address: 'TOKEN1', symbol: 'BONK' }, priceUsd: '0.0000312', url: 'https://dex/x' }]
      : [{ baseToken: { address: '0xabc', symbol: 'PEPE' }, priceUsd: '5', url: 'https://dex/y' }];
    return { ok: true, json: async () => body };
  };

  const t0 = Date.parse('2026-01-01T00:00:00Z');
  await run({ rulesPath, statePath, now: t0, fetchImpl });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].topic, 'test-topic');
  assert.match(sent[0].title, /BONK/);

  await run({ rulesPath, statePath, now: t0 + 5 * 60 * 1000, fetchImpl });
  assert.equal(sent.length, 1); // cooldown

  await run({ rulesPath, statePath, now: t0 + 25 * 3600 * 1000, fetchImpl });
  assert.equal(sent.length, 2); // cooldown expired

  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.ok(state.lastNotified.r1);
  assert.equal(state.lastNotified.r2, undefined);
});
