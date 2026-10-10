// Pure logic shared by the monitor (and mirrored in docs/index.html).

export const RULE_TYPES = ['above', 'below', 'pct_up', 'pct_down'];
export const DEFAULT_COOLDOWN_HOURS = 24;

/** Target price a rule is waiting for, or null if the rule is invalid. */
export function targetPrice(rule) {
  const v = Number(rule.value);
  if (!Number.isFinite(v) || v <= 0) return null;
  switch (rule.type) {
    case 'above':
    case 'below':
      return v;
    case 'pct_up':
    case 'pct_down': {
      const base = Number(rule.basePrice);
      if (!Number.isFinite(base) || base <= 0) return null;
      return rule.type === 'pct_up' ? base * (1 + v / 100) : base * (1 - v / 100);
    }
    default:
      return null;
  }
}

/** True when the current price satisfies the rule. */
export function isTriggered(rule, price) {
  const target = targetPrice(rule);
  if (target === null || !Number.isFinite(price)) return false;
  return rule.type === 'above' || rule.type === 'pct_up' ? price >= target : price <= target;
}

/** True when the rule fired recently and must stay quiet. */
export function inCooldown(rule, lastNotifiedIso, now = Date.now()) {
  if (!lastNotifiedIso) return false;
  const hours = Number(rule.cooldownHours ?? DEFAULT_COOLDOWN_HOURS);
  return now - Date.parse(lastNotifiedIso) < hours * 3600 * 1000;
}

/** Pick the most liquid pair whose base token matches the rule's token address. */
export function pickPair(pairs, tokenAddress) {
  const want = tokenAddress.toLowerCase();
  const matches = (pairs ?? []).filter(
    (p) => p?.baseToken?.address?.toLowerCase() === want && Number(p.priceUsd) > 0,
  );
  matches.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return matches[0] ?? null;
}

/** Compact price string that stays readable for 0.0000031-style prices. */
export function formatPrice(p) {
  if (p >= 1) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
  const s = Number(p.toPrecision(4)).toString();
  return `$${s.includes('e') ? p.toFixed(12).replace(/0+$/, '') : s}`;
}

export function describeRule(rule) {
  switch (rule.type) {
    case 'above': return `${formatPrice(Number(rule.value))} 以上`;
    case 'below': return `${formatPrice(Number(rule.value))} 以下`;
    case 'pct_up': return `登録時から +${rule.value}%`;
    case 'pct_down': return `登録時から -${rule.value}%`;
    default: return '不明な条件';
  }
}
