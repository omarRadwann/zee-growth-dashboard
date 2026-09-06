import {
  days,
  shift,
  periods,
  covered,
  adsSummary,
  commerceSummary,
  seoSummary,
  delta,
  validDate,
} from './metrics.mjs';

export function coverageStatus(data, key, period) {
  const source = data.sources[key];
  const connected = source?.status === 'connected';
  return {
    connected,
    current: connected && covered(data, key, period.from, period.to),
    before: connected && covered(data, key, period.beforeFrom, period.beforeTo),
    days: connected ? days(source.from, source.to).length : 0,
  };
}

// Only offer a window when ALL its days exist. Never shorten a period silently.
export function latestWindow(data, key, length, today, comparison = false) {
  const source = data.sources[key];
  if (source?.status !== 'connected' || !validDate(today)) return null;
  const to = source.to < today ? source.to : shift(today, -1);
  const window = periods(to, length);
  return covered(data, key, comparison ? window.beforeFrom : window.from, to)
    ? window
    : null;
}

export function safeProgress(raw) {
  if (
    !raw ||
    !Number.isInteger(raw.completeDays) ||
    !Number.isInteger(raw.targetDays) ||
    raw.completeDays < 0 ||
    raw.targetDays < 1 ||
    raw.targetDays > 731 ||
    raw.completeDays > raw.targetDays
  )
    return null;
  return {
    completeDays: raw.completeDays,
    targetDays: raw.targetDays,
    workingDate: validDate(raw.workingDate) ? raw.workingDate : null,
    error: typeof raw.error === 'string' ? raw.error.slice(0, 300) : '',
    wpCronDisabled: raw.wpCronDisabled === true,
  };
}

/** @returns {{ source: string, title: string, change: number, detail: string }[]} */
export function reviewInsights(data, period, campaign = 'all') {
  const results = [];
  for (const [source, fn, metric, label] of [
    ['ads', adsSummary, 'purchases', 'Ads-attributed purchases'],
    ['woo', commerceSummary, 'orders', 'Store orders'],
    ['seo', seoSummary, 'clicks', 'Organic clicks'],
  ]) {
    const now = fn(data, period.from, period.to, campaign);
    const before = fn(data, period.beforeFrom, period.beforeTo, campaign);
    const change = delta(now?.[metric], before?.[metric]);
    if (change !== null)
      results.push({
        source: String(source),
        title: String(label),
        change,
        detail:
          source === 'ads'
            ? 'Compare purchase value and spend too; recent attribution can change.'
            : source === 'woo'
              ? 'Check payment, cancellation and refund outcomes before treating more orders as more revenue.'
              : 'Review brand vs non-brand and published article URLs. A change is not proof that articles caused it.',
      });
  }
  return results;
}
