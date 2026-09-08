'use client';
import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adsSummary, commerceSummary, seoSummary, days, shift, emptyData } from '@/lib/metrics.mjs';

const options = [
  { id: 'cost', label: 'Ad spend', unit: 'EGP', note: 'Google Ads spend · not the final invoice' },
  { id: 'purchaseValue', label: 'Ads purchase value', unit: 'EGP', note: 'Attributed purchase value · not cash collected' },
  { id: 'orders', label: 'Store orders', unit: '', note: 'All channels · grouped by order creation date' },
  { id: 'clicks', label: 'Organic clicks', unit: '', note: 'Google Search Console · its reporting calendar applies' },
] as const;
export default function PerformanceLens({ data, from, to, beforeFrom, campaign, onConnect }: {
  data: ReturnType<typeof emptyData>; from: string; to: string; beforeFrom: string; campaign: string; onConnect: () => void;
}) {
  const [metric, setMetric] = useState<string>('cost');
  const gradient = useId().replace(/:/g, '');
  const option = options.find(o => o.id === metric)!;
  const read = (date: string) => {
    const summary = metric === 'orders' ? commerceSummary(data, date, date) : metric === 'clicks' ? seoSummary(data, date, date) : adsSummary(data, date, date, campaign);
    return summary ? (summary as Record<string, number>)[metric] ?? null : null;
  };
  const rows = days(from, to).map((date: string, index: number) => ({ date, previousDate: shift(beforeFrom, index), current: read(date), previous: read(shift(beforeFrom, index)) }));
  const available = rows.filter(r => r.current !== null).length;
  const total = available === rows.length && rows.length ? rows.reduce((sum, r) => sum + (r.current ?? 0), 0) : null;
  const number = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  return <Card className="performance-lens">
    <CardHeader>
      <div className="lens-heading"><div><span className="eyebrow">PERFORMANCE OVER TIME</span><CardTitle>See what is changing</CardTitle><CardDescription>Switch sources without mixing sales, attribution and traffic.</CardDescription></div><div className="lens-total">{total === null ? '—' : number(total)}<small>{option.unit || option.label} · selected period</small></div></div>
      <fieldset className="lens-tabs" aria-label="Chart metric">{options.map(o => <Button key={o.id} variant={metric === o.id ? 'default' : 'ghost'} aria-pressed={metric === o.id} onClick={() => setMetric(o.id)}>{o.label}</Button>)}</fieldset>
    </CardHeader>
    <CardContent>
      {available ? <><div className="lens-legend"><span>● Current period</span><span>┄ Previous period</span><small>{available}/{rows.length} days available</small></div><div className="lens-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 12, right: 12, left: 8, bottom: 8 }} accessibilityLayer><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3459e6" stopOpacity={0.22}/><stop offset="100%" stopColor="#3459e6" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e8edf5"/><XAxis dataKey="date" tickFormatter={d => d.slice(5)} minTickGap={42} axisLine={false} tickLine={false}/><YAxis width={66} axisLine={false} tickLine={false} tickFormatter={n => Intl.NumberFormat('en', { notation: 'compact' }).format(n)}/><Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload; return active && row ? <div className="lens-tooltip"><strong>{row.date}</strong><p>Current: {row.current === null ? 'Unavailable' : number(row.current)} {option.unit}</p><p>Previous ({row.previousDate}): {row.previous === null ? 'Unavailable' : number(row.previous)} {option.unit}</p></div> : null; }}/><Area type="linear" dataKey="previous" stroke="#9ba9c5" strokeDasharray="5 5" fill="none" strokeWidth={2} connectNulls={false} isAnimationActive={false}/><Area type="linear" dataKey="current" stroke="#3459e6" fill={`url(#${gradient})`} strokeWidth={3} connectNulls={false} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></> : <div className="lens-empty"><span className="eyebrow">AWAITING VERIFIED DATA</span><h3>No {option.label.toLowerCase()} for these dates</h3><p>Connect the source or choose a period with coverage. Missing data is never shown as zero.</p><Button variant="outline" onClick={onConnect}>Review data connections</Button></div>}
      <p className="lens-footnote">{option.note}. Gaps mean unavailable data; totals require complete coverage.</p>
    </CardContent>
  </Card>;
}
