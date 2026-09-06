'use client';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Upload,
  Download,
  Search,
  SlidersHorizontal,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  DIMENSIONS,
  METRICS,
  reportFromFeed,
  filterRows,
  summarize,
  groupRows,
  comparable,
  exportGroups,
  trendRows,
} from '@/lib/explorer.mjs';
import { delta } from '@/lib/metrics.mjs';
import type { ReportData } from '@/lib/report-types';
import './report-explorer.css';

const labels = METRICS as Record<string, string>,
  dimLabels = DIMENSIONS as Record<string, string>;
const money = new Set([
  'cost',
  'purchaseValue',
  'conversionValue',
  'recordedPaidValue',
  'refundValue',
  'grossSales',
  'netSales',
  'shipping',
  'tax',
  'cpc',
  'costPerConversion',
  'aov',
]);
function value(v: number | null | undefined, key: string, currency = 'EGP') {
  if (v == null || !Number.isFinite(v)) return '—';
  if (key === 'ctr') return (100 * v).toFixed(2) + '%';
  if (key === 'roas') return v.toFixed(2) + '×';
  return (
    (money.has(key) && currency === 'EGP' ? 'EGP ' : '') +
    new Intl.NumberFormat('en-EG', { maximumFractionDigits: 2 }).format(v)
  );
}
function Picker({
  label,
  current,
  options,
  onChange,
}: {
  label: string;
  current: string;
  options: [string, string][];
  onChange: (s: string) => void;
}) {
  return (
    <label className="rx-picker">
      <span>{label}</span>
      <Select value={current} onValueChange={(v) => onChange(String(v))}>
        <SelectTrigger aria-label={label}>
          <SelectValue>
            {options.find((x) => x[0] === current)?.[1] || current}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
type Props = { data: ReportData; onConnect: () => void };
export default function ReportExplorer({ data, onConnect }: Props) {
  const [imports, setImports] = useState<any[]>([]),
    [active, setActive] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [search, setSearch] = useState(''),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [group, setGroup] = useState(''),
    [metric, setMetric] = useState(''),
    [granularity, setGranularity] = useState('day'),
    [page, setPage] = useState(0),
    [ascending, setAscending] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const feeds = useMemo(
    () =>
      ['ads', 'store', 'seo']
        .map((k) => reportFromFeed(data, k))
        .filter(Boolean),
    [data],
  );
  const reports: any[] = [...feeds, ...imports];
  const report: any = reports.find((r) => r.id === active) || reports[0];
  const selectedMetric = report?.metrics.includes(metric)
    ? metric
    : report?.metrics.includes('cost')
      ? 'cost'
      : report?.metrics[0];
  const selectedGroup = report?.dimensions.includes(group)
    ? group
    : report?.dimensions.includes('campaign')
      ? 'campaign'
      : report?.dimensions.find((x: string) => x !== 'date') || 'date';
  const validRange = !from || !to || from <= to;
  const selectedFrom = report?.from ? from || report.from : '',
    selectedTo = report?.to ? to || report.to : '';
  const deferredSearch = useDeferredValue(search);
  const effectiveFilters = useMemo(
    () => ({
      from: selectedFrom,
      to: selectedTo,
      search: deferredSearch,
      dimensions: filters,
    }),
    [selectedFrom, selectedTo, deferredSearch, filters],
  );
  const rows = useMemo(
    () => (report && validRange ? filterRows(report, effectiveFilters) : []),
    [report, validRange, effectiveFilters],
  );
  const totals: any = useMemo(
    () => (report ? summarize(rows, report.metrics) : {}),
    [report, rows],
  );
  const p = useMemo(
    () =>
      report && validRange
        ? comparable(report, selectedFrom, selectedTo)
        : null,
    [report, validRange, selectedFrom, selectedTo],
  );
  const before: any = useMemo(
    () =>
      p
        ? summarize(
            filterRows(report, {
              ...effectiveFilters,
              from: p.beforeFrom,
              to: p.beforeTo,
            }),
            report.metrics,
          )
        : null,
    [report, p, effectiveFilters],
  );
  const groups: any[] = useMemo(
    () =>
      report
        ? groupRows(rows, selectedGroup, report.metrics).sort(
            (a: any, b: any) =>
              ((b[selectedMetric] ?? -Infinity) -
                (a[selectedMetric] ?? -Infinity)) *
              (ascending ? -1 : 1),
          )
        : [],
    [report, rows, selectedGroup, selectedMetric, ascending],
  );
  const series: any[] = useMemo(
    () =>
      report?.from
        ? trendRows(rows, report.metrics, selectedFrom, selectedTo, granularity)
        : [],
    [report, rows, granularity, selectedFrom, selectedTo],
  );
  const dimensionOptions = useMemo(
    () =>
      Object.fromEntries(
        (report?.dimensions || [])
          .filter(
            (k: string) => !['date', 'query', 'product', 'page'].includes(k),
          )
          .map((k: string) => [
            k,
            [
              ['all', 'All'],
              ...Array.from(
                new Set(report.rows.map((r: any) => r[k]).filter(Boolean)),
              )
                .sort()
                .map((v) => [String(v), String(v)]),
            ],
          ]),
      ),
    [report],
  );
  const extra = Object.keys(totals).filter((k) => !report?.metrics.includes(k));
  const displayMetrics = report ? [...report.metrics, ...extra] : [];
  const primaryKeys = (
    report?.kind === 'ads'
      ? ['cost', 'clicks', 'conversions', 'cpc', 'ctr', 'roas']
      : report?.kind === 'store'
        ? [
            'orders',
            'recordedPaidValue',
            'grossSales',
            'netSales',
            'aov',
            'refundValue',
          ]
        : ['clicks', 'impressions', 'ctr', 'position']
  )
    .filter((k) => displayMetrics.includes(k))
    .slice(0, 6);
  function reset() {
    setFrom('');
    setTo('');
    setFilters({});
    setSearch('');
    setGroup('');
    setMetric('');
    setPage(0);
    setAscending(false);
  }
  async function openFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const incoming: any[] = [];
      for (const f of files) {
        if (f.size > 100 * 1024 * 1024)
          throw Error('Each CSV must be smaller than 100 MB.');
        const buffer = await f.arrayBuffer();
        const report = await new Promise<any>((resolve, reject) => {
          const worker = new Worker(
            new URL('./report-import.worker.ts', import.meta.url),
            { type: 'module' },
          );
          const timeout = setTimeout(() => {
            worker.terminate();
            reject(
              Error('The import took too long. Export a smaller date range.'),
            );
          }, 90000);
          worker.onmessage = (e) => {
            clearTimeout(timeout);
            worker.terminate();
            e.data.ok ? resolve(e.data.report) : reject(Error(e.data.message));
          };
          worker.onerror = () => {
            clearTimeout(timeout);
            worker.terminate();
            reject(
              Error(
                'The report could not be read. Export a smaller report and retry.',
              ),
            );
          };
          worker.postMessage({ buffer, name: f.name }, [buffer]);
        });
        incoming.push(report);
      }
      if (
        imports.length + incoming.length > 10 ||
        [...imports, ...incoming].reduce((n, r) => n + r.rows.length, 0) >
          600000
      )
        throw Error(
          'Keep at most 10 reports and 600,000 combined rows open. Close an older report first.',
        );
      setImports((v) => [...v, ...incoming]);
      setActive(incoming[0].id);
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }
  function exportView() {
    const output = exportGroups(groups, selectedGroup, displayMetrics);
    const blob = new Blob([output], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ZEE-filtered-report.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  const graphColour =
    report?.kind === 'store'
      ? '#2960a6'
      : report?.kind === 'seo'
        ? '#7254a7'
        : '#17644f';
  return (
    <div className="rx">
      <input
        ref={file}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        multiple
        hidden
        onChange={openFiles}
      />
      <div className="rx-toolbar">
        <div>
          <h2>Performance explorer</h2>
          <p>
            Compare results, find opportunities and follow the numbers to their
            source.
          </p>
        </div>
        <div className="rx-actions">
          <Button variant="outline" onClick={onConnect}>
            Connect sources
          </Button>
          <Button disabled={busy} onClick={() => file.current?.click()}>
            <Upload size={16} />
            {busy ? 'Reading reports…' : 'Open real CSV reports'}
          </Button>
        </div>
      </div>
      {error && (
        <div className="rx-error" role="alert">
          {error}
        </div>
      )}
      {!report ? (
        <section className="rx-start">
          <div className="rx-start-icon">
            <BarChart3 size={36} />
          </div>
          <h3>No reporting source is connected yet</h3>
          <p>
            This page needs private account data to calculate results. Connect
            the reporting service, or open an actual export from one of the
            sources below.
          </p>
          <div className="rx-source-grid">
            <article>
              <b>Google Ads</b>
              <p>
                Spend, clicks, impressions and configured conversions. Campaign,
                device, network and search-term breakdowns when exported.
              </p>
              <a
                href="https://ads.google.com/aw/overview?ocid=880640158"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open ZEE Google Ads ↗
              </a>
            </article>
            <article>
              <b>WooCommerce</b>
              <p>
                Orders, sales, refunds and products. Use an aggregate Analytics
                export, not a customer contact list.
              </p>
              <a
                href="https://zee-official.com/wp-admin/admin.php?page=wc-admin&path=%2Fanalytics%2Frevenue"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open store reports ↗
              </a>
            </article>
            <article>
              <b>Search Console</b>
              <p>
                Organic clicks, impressions, search queries, pages and devices.
                Arabic and English queries can be explored separately.
              </p>
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Search Console ↗
              </a>
            </article>
          </div>
          <p className="rx-private">
            <ShieldCheck size={18} /> CSV imports are read in this tab only.
            They are not uploaded to GitHub, shared, or automatically refreshed.
          </p>
        </section>
      ) : (
        <>
          <div className="rx-report-selector">
            <Picker
              label="Data source / report"
              current={report.id}
              options={reports.map((r) => [r.id, r.name])}
              onChange={(id) => {
                setActive(id);
                reset();
              }}
            />
            <span
              className={
                'rx-source-status ' +
                (report.environment === 'example' ? 'example' : '')
              }
            >
              {report.environment === 'example'
                ? 'Synthetic example'
                : report.historical
                  ? 'Imported report · not live'
                  : 'Connected report'}
            </span>
            {report.historical && (
              <Button
                variant="ghost"
                onClick={() => {
                  setImports((v) => v.filter((r) => r.id !== report.id));
                  setActive('');
                  reset();
                }}
              >
                <X size={16} />
                Close this report
              </Button>
            )}
          </div>
          <div className="rx-provenance">
            <strong>
              {report.from ? `${report.from} → ${report.to}` : report.period}
            </strong>
            <span>
              {report.rows.length.toLocaleString()} source rows ·{' '}
              {report.historical ? 'Opened' : 'Source refreshed'}{' '}
              {new Date(report.loadedAt).toLocaleString('en-GB', {
                timeZone: 'Africa/Cairo',
              })}{' '}
              Cairo
            </span>
            <p>
              {report.scope}{' '}
              {report.skippedTotals > 0
                ? `${report.skippedTotals} total rows excluded to avoid double counting.`
                : ''}{' '}
              {report.currency === 'Unconfirmed'
                ? 'Currency was not supplied; monetary values have no assumed currency.'
                : ''}
            </p>
          </div>
          <section className="rx-filters" aria-label="Report filters">
            <div className="rx-filter-title">
              <SlidersHorizontal size={18} />
              <b>Filter this report</b>
              <Button variant="ghost" onClick={reset}>
                Reset filters
              </Button>
            </div>
            <div className="rx-filter-grid">
              {report.from && (
                <>
                  <label>
                    From
                    <input
                      type="date"
                      value={selectedFrom}
                      min={report.from}
                      max={report.to}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        setPage(0);
                      }}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={selectedTo}
                      min={report.from}
                      max={report.to}
                      onChange={(e) => {
                        setTo(e.target.value);
                        setPage(0);
                      }}
                    />
                  </label>
                </>
              )}
              {Object.keys(dimensionOptions).map((k: string) => (
                <Picker
                  key={k}
                  label={dimLabels[k]}
                  current={filters[k] || 'all'}
                  options={dimensionOptions[k] as [string, string][]}
                  onChange={(v) => {
                    setFilters((old) => ({ ...old, [k]: v }));
                    setPage(0);
                  }}
                />
              ))}
              <label className="rx-search">
                Search within report
                <div>
                  <Search size={17} />
                  <input
                    value={search}
                    placeholder="Campaign, term, product or page…"
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    dir="auto"
                  />
                </div>
              </label>
            </div>
            {!report.from && (
              <p>
                This export has no daily dates. Date filters, time trends and
                before/after comparisons are unavailable; no history is
                inferred.
              </p>
            )}
            {!validRange && (
              <p role="alert" className="rx-error">
                The start date must be before the end date.
              </p>
            )}
          </section>
          <div className="rx-kpis">
            {primaryKeys.map((k) => (
              <article key={k}>
                <span>{labels[k]}</span>
                <strong>{value(totals[k], k, report.currency)}</strong>
                {before && delta(totals[k], before[k]) !== null ? (
                  <small>
                    {(delta(totals[k], before[k]) as number) > 0 ? '+' : ''}
                    {(delta(totals[k], before[k]) as number).toFixed(1)}% vs
                    prior equal period
                  </small>
                ) : (
                  <small>No comparable baseline</small>
                )}
              </article>
            ))}
          </div>
          {report.kind === 'ads' && (
            <p className="rx-caution">
              “Conversions” includes the goals configured in this Ads report; it
              does not necessarily mean purchases or qualified leads. Purchase
              ROAS appears only when purchase value is explicitly supplied.
            </p>
          )}
          <div className="rx-chart-controls">
            <Picker
              label="Chart metric"
              current={selectedMetric}
              options={report.metrics
                .filter((k: string) => k !== 'position')
                .map((k: string) => [k, labels[k]])}
              onChange={setMetric}
            />
            <Picker
              label="Break down by"
              current={selectedGroup}
              options={report.dimensions.map((k: string) => [k, dimLabels[k]])}
              onChange={(k) => {
                setGroup(k);
                setPage(0);
              }}
            />
            {report.from && (
              <Picker
                label="Trend grouping"
                current={granularity}
                options={['day', 'week', 'month'].map((k) => [
                  k,
                  k[0].toUpperCase() + k.slice(1),
                ])}
                onChange={setGranularity}
              />
            )}
            <span>{rows.length.toLocaleString()} matching source rows</span>
          </div>
          {rows.length === 0 ? (
            <div className="rx-no-rows">
              <h3>No rows match these filters</h3>
              <p>
                Broaden the dates or reset the filters. A missing result is not
                evidence of zero business activity.
              </p>
            </div>
          ) : (
            <div className="rx-charts">
              <section>
                <h3>
                  {labels[selectedMetric]} by{' '}
                  {dimLabels[selectedGroup]?.toLowerCase()}
                </h3>
                <p>
                  Top 10 groups in this report. The table below contains all
                  matching groups.
                </p>
                <div className="rx-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[...groups]
                        .sort(
                          (a, b) =>
                            (b[selectedMetric] ?? 0) - (a[selectedMetric] ?? 0),
                        )
                        .slice(0, 10)}
                      layout="vertical"
                      margin={{ left: 0, right: 20 }}
                    >
                      <CartesianGrid horizontal={false} stroke="#e5e9ed" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={130}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v: string) =>
                          v.length > 18 ? v.slice(0, 17) + '…' : v
                        }
                      />
                      <Tooltip
                        formatter={(v: any) =>
                          value(v, selectedMetric, report.currency)
                        }
                        labelStyle={{ color: '#152c39' }}
                      />
                      <Bar
                        dataKey={selectedMetric}
                        name={labels[selectedMetric]}
                        fill={graphColour}
                        radius={[0, 4, 4, 0]}
                      >
                        {groups.slice(0, 10).map((r, i) => (
                          <Cell
                            key={r.name}
                            fill={i === 0 ? graphColour : '#91b6ad'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section>
                <h3>
                  {report.from
                    ? 'Performance over time'
                    : 'Share of ' + labels[selectedMetric]?.toLowerCase()}
                </h3>
                <p>
                  {report.from
                    ? 'Available source dates only; absent dates are not filled with invented values.'
                    : 'Relative contribution of the top groups. Not share of the whole Egyptian market.'}
                </p>
                {report.from ? (
                  <div className="rx-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={series}
                        margin={{ left: 8, right: 12, top: 10 }}
                      >
                        <CartesianGrid vertical={false} stroke="#e5e9ed" />
                        <XAxis
                          dataKey="name"
                          minTickGap={36}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(v: any) =>
                            value(v, selectedMetric, report.currency)
                          }
                        />
                        <Area
                          dataKey={selectedMetric}
                          name={labels[selectedMetric]}
                          stroke={graphColour}
                          fill={graphColour}
                          fillOpacity={0.12}
                          strokeWidth={2}
                          connectNulls={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rx-shares">
                    {groups.slice(0, 6).map((r) => {
                      const pct =
                        totals[selectedMetric] > 0 && r[selectedMetric] >= 0
                          ? (r[selectedMetric] / totals[selectedMetric]) * 100
                          : null;
                      return (
                        <div key={r.name}>
                          <div>
                            <span dir="auto">{r.name}</span>
                            <strong>
                              {pct === null ? '—' : pct.toFixed(1) + '%'}
                            </strong>
                          </div>
                          <div className="rx-share-track">
                            <i
                              style={{
                                width:
                                  Math.max(0, Math.min(100, pct || 0)) + '%',
                                background: graphColour,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
          {p && before && (
            <section className="rx-comparison">
              <h3>
                <TrendingUp size={20} /> Before and after
              </h3>
              <p>
                Before: {p.beforeFrom}–{p.beforeTo}. After: {p.from}–{p.to}.
                Both use the same active filters. A change is an observation,
                not proof that SEO or an ad change caused it.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                    <TableHead>Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {primaryKeys.map((k) => (
                    <TableRow key={k}>
                      <TableCell>{labels[k]}</TableCell>
                      <TableCell>
                        {value(before[k], k, report.currency)}
                      </TableCell>
                      <TableCell>
                        {value(totals[k], k, report.currency)}
                      </TableCell>
                      <TableCell>
                        {before[k] == null || totals[k] == null
                          ? '—'
                          : value(totals[k] - before[k], k, report.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}
          <section className="rx-detail">
            <div className="rx-toolbar">
              <div>
                <h3>Detailed results</h3>
                <p>
                  {groups.length.toLocaleString()} groups · sorted by{' '}
                  {labels[selectedMetric]?.toLowerCase()}
                </p>
              </div>
              <div className="rx-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAscending((v) => !v);
                    setPage(0);
                  }}
                >
                  {ascending ? 'Lowest first' : 'Highest first'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!groups.length}
                  onClick={exportView}
                >
                  <Download size={16} />
                  Export filtered table
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{dimLabels[selectedGroup]}</TableHead>
                  {displayMetrics.map((k) => (
                    <TableHead key={k}>{labels[k]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.slice(page * 25, page * 25 + 25).map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="rx-name" dir="auto">
                      {r.name}
                    </TableCell>
                    {displayMetrics.map((k) => (
                      <TableCell key={k}>
                        {value(r[k], k, report.currency)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="rx-pagination">
              <span>
                {groups.length ? Math.min(page * 25 + 1, groups.length) : 0}–
                {Math.min((page + 1) * 25, groups.length)} of {groups.length}
              </span>
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={(page + 1) * 25 >= groups.length}
                onClick={() => setPage((v) => v + 1)}
              >
                Next
              </Button>
            </div>
          </section>
          <p className="rx-private">
            <ShieldCheck size={18} /> Imported files remain in this tab until
            you close or reload it. They are separate snapshots, not merged with
            account totals or saved reporting history. Brand-term and language
            filters are text classifications, not Google-provided audience
            labels.
          </p>
        </>
      )}
    </div>
  );
}
