import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { formatPrice, describeRule, inCooldown, isTriggered, pickPair } from './lib.js';

const DEX_API = 'https://api.dexscreener.com/tokens/v1';
const NTFY_URL = process.env.NTFY_URL ?? 'https://ntfy.sh';
const BATCH = 30; // DEXScreener accepts up to 30 addresses per request

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

/** Fetch all pairs for the given chain/address groups, one request per 30 tokens. */
export async function fetchPairs(rules, fetchImpl = fetch) {
  const byChain = new Map();
  for (const r of rules) {
    if (!byChain.has(r.chainId)) byChain.set(r.chainId, new Set());
    byChain.get(r.chainId).add(r.tokenAddress);
  }
  const pairsByChain = new Map();
  for (const [chainId, addrs] of byChain) {
    const list = [...addrs];
    const pairs = [];
    for (let i = 0; i < list.length; i += BATCH) {
      const url = `${DEX_API}/${encodeURIComponent(chainId)}/${list.slice(i, i + BATCH).join(',')}`;
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`DEXScreener ${res.status} for ${chainId}`);
      pairs.push(...(await res.json()));
    }
    pairsByChain.set(chainId, pairs);
  }
  return pairsByChain;
}

export async function notify(rule, pair, fetchImpl = fetch) {
  const topic = process.env.NTFY_TOPIC;
  const price = Number(pair.priceUsd);
  const title = `🚀 ${rule.symbol ?? pair.baseToken.symbol} が ${formatPrice(price)} に到達`;
  const message = `条件: ${describeRule(rule)}`;
  if (!topic) {
    console.log(`[dry-run] ${title} / ${message}`);
    return;
  }
  const res = await fetchImpl(NTFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic,
      title,
      message,
      click: pair.url,
      priority: 4,
      tags: ['chart_with_upwards_trend'],
    }),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
}

export async function run({ rulesPath = 'rules.json', statePath = 'state.json', now = Date.now(), fetchImpl = fetch } = {}) {
  const { rules = [] } = await readJson(rulesPath, {});
  const state = await readJson(statePath, { lastNotified: {} });
  state.lastNotified ??= {};

  const active = rules.filter((r) => r.enabled !== false && r.chainId && r.tokenAddress);
  const pairsByChain = active.length ? await fetchPairs(active, fetchImpl) : new Map();

  for (const rule of active) {
    const pair = pickPair(pairsByChain.get(rule.chainId), rule.tokenAddress);
    if (!pair) {
      console.warn(`price not found: ${rule.symbol ?? rule.tokenAddress} (${rule.chainId})`);
      continue;
    }
    if (!isTriggered(rule, Number(pair.priceUsd))) continue;
    if (inCooldown(rule, state.lastNotified[rule.id], now)) continue;
    try {
      await notify(rule, pair, fetchImpl);
      state.lastNotified[rule.id] = new Date(now).toISOString();
    } catch (e) {
      console.error(`notify failed for ${rule.id}: ${e.message}`); // retried on next run
    }
  }

  // drop state for deleted rules
  const ids = new Set(rules.map((r) => r.id));
  for (const id of Object.keys(state.lastNotified)) if (!ids.has(id)) delete state.lastNotified[id];

  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
  return state;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
