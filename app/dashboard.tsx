'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ReportExplorer from './report-explorer';
import DataHealth from './data-health';
import PerformanceLens from './performance-lens';
import DirectConnection from './direct-connection';
import {
  mergeSnapshot,
  availableSources,
  missingViewSources,
  SOURCE_LABELS,
} from '@/lib/snapshot-import.mjs';
import {
  safeProgress,
  reviewInsights,
  latestWindow,
} from '@/lib/readiness.mjs';
import { Progress } from '@/components/ui/progress';
import { registerReportingTools, type ModelContext } from '@/lib/agent-tools';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  Flag,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Menu,
  MessageCircle,
  MousePointer2,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Unplug,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  SOURCES,
  EVENT_TYPES,
  INTENT_EVENTS,
  day,
  shift,
  validDate,
  days,
  periods,
  changePeriods,
  delta,
  emptyData,
  adsSummary,
  commerceSummary,
  seoSummary,
  eventSummary,
  exampleData,
  validateData,
  stale,
  csv,
} from '@/lib/metrics.mjs';

type Data = ReturnType<typeof emptyData>;
type View =
  | 'explore'
  | 'overview'
  | 'compare'
  | 'campaigns'
  | 'activity'
  | 'seo'
  | 'changes'
  | 'connections'
  | 'guide';
type Note = { id: string; date: string; title: string; type: string };
const SOURCE_NAMES: Record<string, string> = {
  ads: 'Google Ads',
  woo: 'WooCommerce',
  events: 'Enquiries & activity',
  seo: 'Search Console',
};
const NAV: { id: View; title: string; icon: typeof Activity }[] = [
  { id: 'explore', title: 'Performance explorer', icon: BarChart3 },
  { id: 'overview', title: 'Overview', icon: LayoutDashboard },
  { id: 'compare', title: 'Before & after', icon: SlidersHorizontal },
  { id: 'campaigns', title: 'Google Ads', icon: MousePointer2 },
  { id: 'activity', title: 'Sales & enquiries', icon: Activity },
  { id: 'seo', title: 'Organic search', icon: Search },
  { id: 'changes', title: 'Change journal', icon: Flag },
];
const BRIDGE_ORIGINS = [
  'https://staging.zenithweave.help',
  'https://zee-official.com',
];
const nf = new Intl.NumberFormat('en-EG', { maximumFractionDigits: 1 });
function fmt(n: number | null | undefined, format = 'number') {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (format === 'money') return 'EGP ' + nf.format(n);
  if (format === 'ratio') return n.toFixed(2) + '×';
  if (format === 'percent') return (n * 100).toFixed(2) + '%';
  return nf.format(n);
}
function dateLabel(date: string) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
function dateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString('en-GB', {
        timeZone: 'Africa/Cairo',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' Cairo'
    : 'No sync yet';
}
function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={'pill ' + tone}>{children}</span>;
}
function Empty({
  title,
  children,
  icon: Icon = BarChart3,
}: {
  title: string;
  children?: React.ReactNode;
  icon?: typeof Activity;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={24} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Change({
  value,
  inverse = false,
}: {
  value: number | null;
  inverse?: boolean;
}) {
  return value === null ? (
    <span className="change neutral">No comparable baseline</span>
  ) : (
    <span
      className={
        'change ' +
        (value === 0
          ? 'neutral'
          : (inverse ? value < 0 : value > 0)
            ? 'positive'
            : 'negative')
      }
    >
      {value > 0 ? (
        <ArrowUpRight size={15} />
      ) : value < 0 ? (
        <ArrowDownLeft size={15} />
      ) : null}
      {value > 0 ? '+' : ''}
      {value.toFixed(1)}% <span>vs previous</span>
    </span>
  );
}
function Metric({
  label,
  value,
  previous,
  format,
  help,
  icon: Icon,
  inverse = false,
  featured = false,
}: {
  label: string;
  value?: number | null;
  previous?: number | null;
  format?: string;
  help: string;
  icon: typeof Activity;
  inverse?: boolean;
  featured?: boolean;
}) {
  return (
    <section className={'metric ' + (featured ? 'featured' : '')}>
      <div className="metric-label">
        {label}
        <Icon size={18} />
      </div>
      <div className="metric-number">{fmt(value, format)}</div>
      <Change value={delta(value, previous)} inverse={inverse} />
      <p>{help}</p>
    </section>
  );
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="table-scroll" tabIndex={0}>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [clearGeneration, setClearGeneration] = useState(0);
  const [view, setView] = useState<View>('overview');
  const [data, setData] = useState<Data>(emptyData);
  const [mode, setMode] = useState<'empty' | 'example' | 'import' | 'bridge'>(
    'empty',
  );
  const [end, setEnd] = useState(shift(day(), -1));
  const [length, setLength] = useState(28);
  const [campaign, setCampaign] = useState('all');
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('all');
  const [changeDate, setChangeDate] = useState(shift(day(), -28));
  const [compareType, setCompareType] = useState('previous');
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState(false);
  const [bridgeState, setBridgeState] = useState('Not connected');
  const [bridgeOrigin, setBridgeOrigin] = useState(BRIDGE_ORIGINS[1]);
  const [syncProgress, setSyncProgress] =
    useState<ReturnType<typeof safeProgress>>(null);
  const [clock, setClock] = useState(Date.now());
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDate, setNoteDate] = useState(day());
  const [noteType, setNoteType] = useState('Content');
  const file = useRef<HTMLInputElement>(null);
  const bridge = useRef<Window | null>(null);
  const session = useRef('');
  const activeOrigin = useRef('');
  const lastResponse = useRef(0);
  const selected = useMemo(() => periods(end, length), [end, length]);
  const period =
    view === 'compare' && compareType === 'change'
      ? changePeriods(changeDate, length)
      : selected;
  const a: any = adsSummary(data, period.from, period.to, campaign);
  const b: any = adsSummary(data, period.beforeFrom, period.beforeTo, campaign);
  const w: any = commerceSummary(data, period.from, period.to);
  const wb: any = commerceSummary(data, period.beforeFrom, period.beforeTo);
  const s: any = seoSummary(data, period.from, period.to);
  const sb: any = seoSummary(data, period.beforeFrom, period.beforeTo);
  const events: any = eventSummary(data, period.from, period.to);
  const connected = SOURCES.filter(
    (k) => data.sources[k]?.status === 'connected',
  ).length;
  const campaigns = [
    ...new Map(data.ads.map((r: any) => [r.campaignId, r.campaign])).entries(),
  ] as [string, string][];
  const series = days(period.from, period.to).map((date: string, i: number) => {
    const current: any = adsSummary(data, date, date, campaign);
    const before = shift(period.beforeFrom, i);
    const prev: any = adsSummary(data, before, before, campaign);
    return {
      date: dateLabel(date),
      current: current?.purchaseValue ?? null,
      previous: prev?.purchaseValue ?? null,
    };
  });
  const seoSeries = days(period.from, period.to).map((date: string) => ({
    date: dateLabel(date),
    clicks: (seoSummary(data, date, date) as any)?.clicks ?? null,
  }));
  const campaignRows = campaigns
    .filter(
      ([id, name]) =>
        (campaign === 'all' || id === campaign) &&
        name.toLowerCase().includes(search.toLowerCase()),
    )
    .map(([id, name]) => ({
      id,
      name,
      ...(adsSummary(data, period.from, period.to, id) || {}),
    }))
    .sort((x: any, y: any) => (y.cost || 0) - (x.cost || 0)) as any[];
  const activityRows = data.events
    .filter((r: any) => eventType === 'all' || r.type === eventType)
    .sort((x: any, y: any) => y.at.localeCompare(x.at));
  const summaryRef = useRef<unknown>(null);
  summaryRef.current = {
    mode,
    environment: data.environment,
    period,
    generatedAt: data.generatedAt,
    ads: a,
    commerce: w,
    seo: s,
    sources: data.sources,
  };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    const lifecycle = new AbortController();
    registerReportingTools(
      context,
      {
        summary: () => summaryRef.current,
        setWindow: (value) => {
          if (value.end >= day())
            throw new Error('Choose a complete day before today in Cairo.');
          flushSync(() => {
            setEnd(value.end);
            setLength(value.days);
            setCompareType('previous');
          });
          return {
            end: value.end,
            days: value.days,
            changed: 'Local dashboard only',
          };
        },
      },
      lifecycle.signal,
    );
    return () => lifecycle.abort();
  }, []);
  const poll = () => {
    if (bridge.current && !bridge.current.closed)
      bridge.current.postMessage(
        { type: 'zee-growth-request', session: session.current },
        activeOrigin.current,
      );
    else if (mode === 'bridge') setBridgeState('Connection window closed');
  };
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem('zee-growth-notes-v1') || '[]',
      );
      if (Array.isArray(stored))
        setNotes(
          stored
            .filter(
              (n) =>
                n &&
                typeof n.title === 'string' &&
                validDate(n.date) &&
                typeof n.id === 'string',
            )
            .slice(0, 200),
        );
    } catch {
      /* Journaling remains usable without local storage. */
    }
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
      if (bridge.current?.closed) setBridgeState('Connection window closed');
      else if (
        lastResponse.current &&
        Date.now() - lastResponse.current > 130000
      )
        setBridgeState('Refresh overdue');
      poll();
    }, 60000);
    return () => clearInterval(timer);
  }, [mode]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== bridge.current ||
        event.origin !== activeOrigin.current ||
        !BRIDGE_ORIGINS.includes(event.origin) ||
        event.data?.session !== session.current
      )
        return;
      if (event.data.type === 'zee-growth-ready') {
        poll();
        return;
      }
      if (event.data.type === 'zee-growth-error') {
        setBridgeState('Connection needs attention');
        setNotice(
          String(
            event.data.message || 'The private connector returned an error.',
          ).slice(0, 300),
        );
        return;
      }
      if (event.data.type !== 'zee-growth-data') return;
      try {
        const clean = validateData(event.data.payload);
        setSyncProgress(safeProgress(event.data.progress));
        setData(clean);
        setMode('bridge');
        setBridgeState('Connected · refresh every minute');
        lastResponse.current = Date.now();
        setConnectionOpen(false);
        setNotice(
          'Private connection established. Source reporting delays still apply.',
        );
      } catch (e) {
        setNotice((e as Error).message);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  function go(next: View) {
    setView(next);
    setMenu(false);
    setSearch('');
  }
  function disconnect() {
    setClearGeneration((value) => value + 1);
    bridge.current?.close();
    bridge.current = null;
    activeOrigin.current = '';
    session.current = '';
    lastResponse.current = 0;
    setData(emptyData());
    setMode('empty');
    setSyncProgress(null);
    setBridgeState('Not connected');
    setCampaign('all');
    setNotice(
      'Reporting data cleared from this tab. Your local change journal is unchanged.',
    );
  }
  function loadExample() {
    disconnect();
    setData(exampleData());
    setMode('example');
    setEnd(shift(day(), -1));
    setNotice(
      'Example mode: every number is synthetic and is not ZEE performance.',
    );
  }
  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    try {
      if (chosen.size > 12 * 1024 * 1024)
        throw new Error('Use a reporting export smaller than 12 MB.');
      if (bridge.current && !bridge.current.closed)
        throw new Error(
          'A connection window is open. Close that window before loading manual snapshots; the connection was not stopped.',
        );
      const hadData = availableSources(data).length > 0;
      const { data: parsed, sources: loaded } = mergeSnapshot(
        data,
        JSON.parse(await chosen.text()),
        mode,
      );
      setData(parsed);
      setMode(parsed.environment === 'example' ? 'example' : 'import');
      const dates = SOURCES.map((s) => parsed.sources[s]?.to)
        .filter((date): date is string => Boolean(date))
        .sort();
      if (dates.length && !hadData)
        setEnd(
          dates[dates.length - 1] < day()
            ? dates[dates.length - 1]
            : shift(day(), -1),
        );
      setNotice(
        `Loaded ${loaded.map((key) => SOURCE_LABELS[key as keyof typeof SOURCE_LABELS]).join(', ')}. Your current tab was kept${hadData ? ', and other source groups were preserved' : ''}. This is a private snapshot, not an automatic update.`,
      );
    } catch (e) {
      setNotice('Import stopped: ' + (e as Error).message);
    }
    event.target.value = '';
  }
  function connect() {
    session.current = crypto.randomUUID();
    activeOrigin.current = bridgeOrigin;
    lastResponse.current = 0;
    bridge.current?.close();
    bridge.current = window.open(
      bridgeOrigin +
        '/wp-admin/admin.php?page=zee-growth-bridge#' +
        encodeURIComponent(session.current),
      'zee-private-connector',
      'popup,width=620,height=720',
    );
    setBridgeState(
      bridge.current
        ? 'Waiting for WordPress sign-in'
        : 'Popup blocked — allow this connection window',
    );
    setNotice(
      'The existing bridge is installed. Sign in on the selected ZEE website and explicitly allow this tab to view reports. No plugin is installed by this button.',
    );
  }
  function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (!noteTitle.trim() || !validDate(noteDate)) return;
    const updated = [
      {
        id: crypto.randomUUID(),
        date: noteDate,
        title: noteTitle.trim().slice(0, 160),
        type: noteType,
      },
      ...notes,
    ].slice(0, 200);
    setNotes(updated);
    try {
      localStorage.setItem('zee-growth-notes-v1', JSON.stringify(updated));
    } catch {
      setNotice('Saved for this tab only; browser storage is unavailable.');
    }
    setNoteTitle('');
    setNoteOpen(false);
  }
  function exportSummary() {
    const metrics = comparisonRows();
    download(
      `ZEE-${mode}-${period.from}-to-${period.to}.csv`,
      csv([
        [
          'ZEE Growth',
          mode === 'example'
            ? 'SYNTHETIC EXAMPLE — NOT ZEE RESULTS'
            : 'Source snapshot',
          data.environment,
        ],
        ['Current period', period.from, period.to],
        ['Previous period', period.beforeFrom, period.beforeTo],
        ['Generated at', data.generatedAt || 'No data'],
        ['Campaign scope (Ads only)', campaign],
        ['Metric', 'Before', 'After', 'Change %'],
        ...metrics.map((r) => [
          r.label,
          r.before ?? 'Unavailable',
          r.after ?? 'Unavailable',
          delta(r.after, r.before) ?? 'No baseline',
        ]),
      ]),
    );
  }
  function exportSnapshot() {
    if (!connected) return;
    download(
      `ZEE-private-${data.environment}-${day()}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
    setNotice(
      'Private snapshot downloaded. It contains business totals: share only with approved teammates. It is not uploaded to GitHub.',
    );
  }
  function comparisonRows() {
    return [
      {
        label: 'Google Ads spend (EGP)',
        before: b?.cost,
        after: a?.cost,
        format: 'money',
        inverse: true,
      },
      {
        label: 'Ads-attributed purchases',
        before: b?.purchases,
        after: a?.purchases,
      },
      {
        label: 'Ads purchase value (EGP)',
        before: b?.purchaseValue,
        after: a?.purchaseValue,
        format: 'money',
      },
      {
        label: 'Purchase ROAS',
        before: b?.roas,
        after: a?.roas,
        format: 'ratio',
      },
      {
        label: 'Cost per Ads purchase (EGP)',
        before: b?.cpa,
        after: a?.cpa,
        format: 'money',
        inverse: true,
      },
      {
        label: 'Store orders placed · all channels',
        before: wb?.orders,
        after: w?.orders,
      },
      {
        label: 'Recorded paid value · all channels',
        before: wb?.recordedPaidValue,
        after: w?.recordedPaidValue,
        format: 'money',
      },
      { label: 'Organic Google clicks', before: sb?.clicks, after: s?.clicks },
      {
        label: 'Organic impressions',
        before: sb?.impressions,
        after: s?.impressions,
      },
    ];
  }
  const navTitle = [
    ...NAV,
    { id: 'connections', title: 'Data connections' },
    { id: 'guide', title: 'How to read this dashboard' },
  ].find((n) => n.id === view)?.title;
  const metricCards = (
    <div className="metrics-grid">
      <Metric
        label="Ad spend"
        value={a?.cost}
        previous={b?.cost}
        format="money"
        help="Google Ads · selected campaigns"
        icon={Wallet}
        inverse
      />
      <Metric
        label="Ads purchase value"
        value={a?.purchaseValue}
        previous={b?.purchaseValue}
        format="money"
        help="Attributed purchase value, not cash received"
        icon={ShoppingBag}
        featured
      />
      <Metric
        label="Purchase ROAS"
        value={a?.roas}
        previous={b?.roas}
        format="ratio"
        help="Purchase value ÷ ad spend. Not profit."
        icon={TrendingUp}
      />
      <Metric
        label="Ads-attributed purchases"
        value={a?.purchases}
        previous={b?.purchases}
        help="Purchase actions only; attribution may be fractional"
        icon={MousePointer2}
      />
    </div>
  );
  const trendChart = (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">GOOGLE ADS</span>
          <h2>Is purchase value growing?</h2>
          <p>Same-length periods, aligned by day within the period.</p>
        </div>
        <Pill>EGP</Pill>
      </div>
      {a ? (
        <>
          <div className="chart-legend">
            <span>
              <i />
              Current period
            </span>
            <span>
              <i className="previous-dot" />
              Previous period
            </span>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 12, right: 12, bottom: 8, left: 8 }}
              >
                <CartesianGrid vertical={false} stroke="#e8edea" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#63736d' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#63736d' }}
                  width={56}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                  }
                />
                <Tooltip
                  formatter={(v: any) => fmt(v, 'money')}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #d7e2dc',
                    fontSize: 14,
                  }}
                />
                <Area
                  name="Previous period"
                  type="monotone"
                  dataKey="previous"
                  stroke="#99ada4"
                  strokeDasharray="5 5"
                  fill="#edf1ee"
                  fillOpacity={0.6}
                  connectNulls={false}
                />
                <Area
                  name="Current period"
                  type="monotone"
                  dataKey="current"
                  stroke="#17644f"
                  strokeWidth={3}
                  fill="#dcedda"
                  fillOpacity={0.65}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="panel-foot">
            {b
              ? 'Previous: ' +
                dateLabel(period.beforeFrom) +
                ' – ' +
                dateLabel(period.beforeTo)
              : 'Previous-period data is unavailable; no baseline line is inferred.'}{' '}
            · Recent conversions may still be revised.
          </p>
        </>
      ) : (
        <Empty title="Your trend will appear here">
          Connect Google Ads or open an export covering {dateLabel(period.from)}
          –{dateLabel(period.to)}. Missing data is never shown as zero.
        </Empty>
      )}
    </section>
  );

  return (
    <div className="dashboard-shell">
      <a href="#workspace" className="skip-link">
        Skip to dashboard
      </a>
      <aside className={'sidebar ' + (menu ? 'mobile-open' : '')}>
        <div className="brand">
          <div className="zee-mark">
            zee<span>زي</span>
          </div>
          <span className="brand-rule" />
          <div>
            GROWTH<span>Team workspace</span>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">Z</div>
          <div>
            <strong>ZEE Egypt</strong>
            <span>Commerce & performance</span>
          </div>
          <LockKeyhole size={15} />
        </div>
        <p className="nav-section">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {NAV.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={'nav-item ' + (view === id ? 'active' : '')}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon size={19} />
              {title}
              {id === 'activity' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <p className="nav-section settings-heading">SETUP & SUPPORT</p>
        <button
          className={'nav-item ' + (view === 'connections' ? 'active' : '')}
          onClick={() => go('connections')}
        >
          <Link2 size={19} />
          Data connections<span className="nav-count">{connected}/4</span>
        </button>
        <button
          className={'nav-item ' + (view === 'guide' ? 'active' : '')}
          onClick={() => go('guide')}
        >
          <CircleHelp size={19} />
          Measurement guide
        </button>
        <div className="sidebar-bottom">
          <div className="security-line">
            <ShieldCheck size={18} />
            <strong>Private data by design</strong>
          </div>
          <p>
            The public website contains no customer records or account
            passwords.
          </p>
          <a
            href="https://github.com/omarRadwann/zee-growth-dashboard"
            target="_blank"
            rel="noreferrer"
          >
            omarRadwann / ZEE <ExternalLink size={13} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              onClick={() => setMenu(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{navTitle}</strong>
          </div>
          <div className="topbar-right">
            <span className="timezone">
              <Clock3 size={14} />
              Cairo · EGP
            </span>
            <Pill
              tone={
                mode === 'example'
                  ? 'warning'
                  : mode === 'bridge'
                    ? 'success'
                    : 'neutral'
              }
            >
              {mode === 'example'
                ? 'Example data'
                : mode === 'empty'
                  ? 'Setup needed'
                  : mode === 'import'
                    ? 'Imported snapshot'
                    : 'Private connection'}
            </Pill>
            <div className="profile">Z</div>
          </div>
        </header>
        {mode === 'example' && (
          <div className="example-banner">
            <Eye size={17} />
            <span>
              <strong>EXAMPLE MODE</strong> — These are made-up figures to
              demonstrate the dashboard. They are not ZEE’s results.
            </span>
            <button onClick={disconnect}>
              Exit example <X size={16} />
            </button>
          </div>
        )}
        {data.environment === 'staging' && (
          <div className="example-banner">
            <ShieldCheck size={18} />
            <span>
              <strong>STAGING DATA</strong> — Test-store results are not
              production sales.
            </span>
          </div>
        )}
        <main id="workspace" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">ZEE GROWTH WORKSPACE</span>
              <h1>
                {view === 'overview'
                  ? 'Performance overview'
                  : navTitle}
              </h1>
              <p>
                {view === 'overview'
                  ? 'Follow your spend, sales and enquiries. Understand what changed.'
                  : view === 'explore'
                    ? 'Charts, flexible filters and comparisons across your real reporting sources.'
                    : view === 'compare'
                      ? 'Compare complete periods. Keep context beside the numbers.'
                      : view === 'activity'
                        ? 'Every outcome has its own meaning. No inflated “total leads” number.'
                        : view === 'seo'
                          ? 'Unpaid Google visibility, kept separate from advertising.'
                          : view === 'connections'
                            ? 'Connect privately. Know where each number comes from.'
                            : view === 'changes'
                              ? 'Record the changes that may explain a movement in performance.'
                              : view === 'guide'
                                ? 'Simple definitions, honest comparisons and the checks that matter.'
                                : 'See which campaigns turn ad spend into attributed purchases.'}
              </p>
            </div>
            <div className="page-actions">
              <Button variant="outline" onClick={() => setNoteOpen(true)}>
                <Plus />
                Log a change
              </Button>
              <Button onClick={exportSummary} disabled={!connected}>
                <Download />
                Export report
              </Button>
            </div>
          </div>
          {notice && (
            <div role="status" className="notice">
              <CircleHelp size={18} />
              <span>{notice}</span>
              <button
                onClick={() => setNotice('')}
                aria-label="Dismiss notification"
              >
                <X size={17} />
              </button>
            </div>
          )}
          <section
            className="connection-strip"
            aria-label="Reporting connection status"
          >
            <div>
              <strong>
                {mode === 'empty'
                  ? 'Connect your accounts to see real results'
                  : mode === 'example'
                    ? 'Example numbers — not ZEE performance'
                    : mode === 'import'
                      ? 'Private snapshot — not an automatic live feed'
                      : bridgeState}
              </strong>
              <p>
                {mode === 'empty'
                  ? 'The website is public; your business data is not. Use the existing private bridge, or open your real CSV exports in Performance explorer.'
                  : `${connected} of 4 source groups received. Check coverage and the source update time before comparing results.`}
              </p>
            </div>
            <div className="inline-actions">
              <Button variant="outline" onClick={() => file.current?.click()}>
                <Upload />
                Open private snapshot
              </Button>
              <Button variant="outline" onClick={() => go('connections')}>
                Check coverage & blockers <ArrowRight />
              </Button>
              <Button onClick={() => setConnectionOpen(true)}>
                <Link2 />
                {mode === 'bridge'
                  ? 'Manage connection'
                  : 'Connect private data'}
              </Button>
            </div>
            {mode === 'bridge' && syncProgress && (
              <div className="sync-progress" role="status">
                <p>
                  <strong>
                    Store history: {syncProgress.completeDays} /{' '}
                    {syncProgress.targetDays} days prepared
                  </strong>
                  {syncProgress.workingDate
                    ? ` · Reading ${syncProgress.workingDate}`
                    : ''}
                </p>
                <Progress
                  value={
                    (100 * syncProgress.completeDays) / syncProgress.targetDays
                  }
                  aria-label="Store history collection"
                />
                {syncProgress.error && <p role="alert">{syncProgress.error}</p>}
                {syncProgress.wpCronDisabled && (
                  <p>
                    WordPress automatic page-load scheduling is disabled.
                    Mostafa must verify server scheduling for updates while this
                    connection is closed.
                  </p>
                )}
              </div>
            )}
          </section>
          {mode === 'import' && (
            <section
              className="connection-strip"
              aria-label="Snapshot contents"
            >
              <div>
                <strong>
                  Available in your snapshots:{' '}
                  {availableSources(data)
                    .map((key) => SOURCE_NAMES[key])
                    .join(', ')}
                </strong>
                <p>
                  {missingViewSources(data, view).length
                    ? `This tab still needs ${missingViewSources(data, view)
                        .map(
                          (key) =>
                            SOURCE_LABELS[key as keyof typeof SOURCE_LABELS],
                        )
                        .join(
                          ' and ',
                        )}. Search Console clicks and impressions are not store sales or enquiries.`
                    : 'Snapshot files only supply the source groups they contain. Loading a file does not change tabs or create data for other sources.'}
                </p>
              </div>
              <div className="inline-actions">
                {data.sources.seo.status === 'connected' && view !== 'seo' && (
                  <Button variant="outline" onClick={() => go('seo')}>
                    View organic search <ArrowRight />
                  </Button>
                )}
                {data.sources.woo.status === 'connected' &&
                  view !== 'activity' && (
                    <Button variant="outline" onClick={() => go('activity')}>
                      View store results <ArrowRight />
                    </Button>
                  )}
                {data.sources.ads.status === 'connected' &&
                  view !== 'campaigns' && (
                    <Button variant="outline" onClick={() => go('campaigns')}>
                      View Google Ads <ArrowRight />
                    </Button>
                  )}
              </div>
            </section>
          )}
          {!['connections', 'changes', 'guide', 'explore'].includes(view) && (
            <div className="filterbar">
              <div className="filters">
                <label>
                  <CalendarDays size={16} />
                  <select
                    aria-label="Reporting period length"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                  >
                    <option value={7}>7 days</option>
                    <option value={28}>28 days</option>
                    <option value={56}>56 days</option>
                  </select>
                </label>
                <label className="end-date">
                  <span>Ending</span>
                  <input
                    type="date"
                    aria-label="Reporting period end"
                    value={end}
                    max={shift(day(), -1)}
                    onChange={(e) => {
                      if (e.target.value && e.target.value < day())
                        setEnd(e.target.value);
                    }}
                  />
                </label>
                {['overview', 'campaigns', 'compare'].includes(view) && (
                  <label>
                    <select
                      aria-label="Google Ads campaign filter"
                      value={campaign}
                      onChange={(e) => setCampaign(e.target.value)}
                    >
                      <option value="all">All Google Ads campaigns</option>
                      {campaigns.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <span className="filter-help">
                {dateLabel(period.from)} – {dateLabel(period.to)} · Today
                excluded
              </span>
            </div>
          )}
          <div hidden={view !== 'explore'}>
            <ReportExplorer
              key={clearGeneration}
              data={data}
              mode={mode}
              onConnect={() => setConnectionOpen(true)}
            />
          </div>
          {['compare', 'connections'].includes(view) && (
            <DataHealth
              data={data}
              mode={mode}
              period={period}
              length={length}
              comparison={view === 'compare'}
              clock={clock}
              onConnect={() => setConnectionOpen(true)}
              onExplore={() => go('explore')}
              onExport={exportSnapshot}
              onWindow={(to) => {
                setEnd(to);
                setCompareType('previous');
                if (view === 'connections') go('overview');
                setNotice(
                  'Dates changed to a complete available window. Sources with shorter history still remain unavailable.',
                );
              }}
            />
          )}
          {['overview', 'compare'].includes(view) && (
            <div className="insight-grid">
              {reviewInsights(data, period, campaign).map((item) => (
                <article key={item.source}>
                  <h3>{item.title}</h3>
                  <div className="insight-change">
                    {item.change > 0 ? '+' : ''}
                    {item.change.toFixed(1)}%
                  </div>
                  <p>Compared with the previous equal-length period.</p>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          )}
          {['activity', 'campaigns', 'seo'].includes(view) &&
            (() => {
              const key =
                view === 'activity' ? 'woo' : view === 'seo' ? 'seo' : 'ads';
              const window = latestWindow(data, key, length, day());
              return window && window.to !== end ? (
                <div className="notice">
                  <span>
                    This source has complete {length}-day coverage ending{' '}
                    {window.to}.
                  </span>
                  <Button variant="outline" onClick={() => setEnd(window.to)}>
                    Use available dates
                  </Button>
                </div>
              ) : null;
            })()}
          {view === 'overview' && (
            <>
              <div className={'setup-banner ' + (connected ? 'compact' : '')}>
                <div className="setup-icon">
                  <Link2 size={24} />
                </div>
                <div>
                  <h2>
                    {connected
                      ? 'Know the source behind every number.'
                      : 'Your workspace is ready. Let’s connect the numbers.'}
                  </h2>
                  <p>
                    {connected
                      ? `${connected} of 4 data sources present. ${mode === 'bridge' ? bridgeState : 'This is a snapshot, not an automatic live feed.'}`
                      : 'Start with Google Ads and your store, then add enquiries and organic search.'}
                  </p>
                </div>
                <Button onClick={() => setConnectionOpen(true)}>
                  <Link2 />
                  Connect data
                </Button>
                {!connected && (
                  <Button variant="outline" onClick={loadExample}>
                    Explore example <ArrowRight />
                  </Button>
                )}
              </div>
              {metricCards}
              <div className="main-grid">
                <PerformanceLens data={data} from={period.from} to={period.to} beforeFrom={period.beforeFrom} campaign={campaign} onConnect={() => setView('connections')} />
                <section className="panel outcomes">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">STORE & ENQUIRIES</span>
                      <h2>Beyond the ad click</h2>
                      <p>All channels · not added to Ads totals</p>
                    </div>
                  </div>
                  {[
                    {
                      title: 'Orders placed',
                      value: w?.orders,
                      text: 'WooCommerce order-created cohort',
                      icon: ShoppingBag,
                    },
                    {
                      title: 'Form enquiries',
                      value: events.form_enquiry,
                      text: 'Successful form submissions only',
                      icon: ClipboardList,
                    },
                    {
                      title: 'WhatsApp conversations',
                      value: events.whatsapp_conversation,
                      text: 'Needs confirmed messaging data',
                      icon: MessageCircle,
                    },
                    {
                      title: 'Answered calls',
                      value: events.answered_call,
                      text: 'Needs call-system confirmation',
                      icon: Phone,
                    },
                  ].map(({ title, value, text, icon: Icon }) => (
                    <div className="outcome-row" key={title}>
                      <div className="outcome-icon">
                        <Icon size={19} />
                      </div>
                      <div>
                        <h3>{title}</h3>
                        <p>{text}</p>
                      </div>
                      <strong>{fmt(value)}</strong>
                    </div>
                  ))}
                  <button
                    className="text-action"
                    onClick={() => go('activity')}
                  >
                    See sales & enquiries <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <div className="lower-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">NEXT BEST ACTION</span>
                      <h2>
                        {!connected
                          ? 'Make the baseline trustworthy.'
                          : 'Check the context before acting.'}
                      </h2>
                    </div>
                    <Flag size={21} />
                  </div>
                  <ol className="action-list">
                    <li>
                      <span>01</span>
                      <div>
                        <strong>Connect and reconcile</strong>
                        <p>
                          Match one complete day to Google Ads and WooCommerce
                          before relying on trends.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <strong>Separate intent from results</strong>
                        <p>
                          A WhatsApp click is interest. A confirmed conversation
                          is a different event.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <strong>Log the launch date</strong>
                        <p>
                          Record content, budget, promotions and stock changes
                          to interpret before/after.
                        </p>
                      </div>
                    </li>
                  </ol>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">DATA HEALTH</span>
                      <h2>Freshness at a glance</h2>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => go('connections')}
                      aria-label="Open connection details"
                    >
                      <ArrowUpRight />
                    </button>
                  </div>
                  {SOURCES.map((k) => (
                    <div className="source-mini" key={k}>
                      <span
                        className={
                          'status-dot ' +
                          (data.sources[k].status === 'connected'
                            ? 'connected'
                            : '')
                        }
                      />
                      <div>
                        <strong>{SOURCE_NAMES[k]}</strong>
                        <p>{dateTime(data.sources[k].lastSync)}</p>
                      </div>
                      <Pill
                        tone={
                          data.sources[k].status === 'connected' &&
                          stale(data.sources[k], clock) === 'Updated'
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {stale(data.sources[k], clock)}
                      </Pill>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
          {view === 'compare' && (
            <>
              <div className="panel compare-controls">
                <div>
                  <h2>What are we comparing?</h2>
                  <p>
                    Both periods contain {length} days. Weekday mix is matched.
                  </p>
                </div>
                <label>
                  <select
                    aria-label="Comparison method"
                    value={compareType}
                    onChange={(e) => setCompareType(e.target.value)}
                  >
                    <option value="previous">
                      Previous equal-length period
                    </option>
                    <option value="change">Before and after a change</option>
                  </select>
                </label>
                {compareType === 'change' && (
                  <label>
                    Change date{' '}
                    <input
                      type="date"
                      value={changeDate}
                      max={day()}
                      onChange={(e) => {
                        if (e.target.value) setChangeDate(e.target.value);
                      }}
                    />
                  </label>
                )}
              </div>
              {period.to >= day() && (
                <div className="warning-box">
                  The after-period is not complete yet. Missing days are not
                  filled with zero. Wait until {dateLabel(shift(period.to, 1))}{' '}
                  for a complete comparison.
                </div>
              )}
              <div className="period-cards">
                <div>
                  <span>BEFORE</span>
                  <strong>
                    {dateLabel(period.beforeFrom)} –{' '}
                    {dateLabel(period.beforeTo)}
                  </strong>
                  <p>
                    {period.beforeFrom.slice(0, 4)} · {length} complete calendar
                    days
                  </p>
                </div>
                <div className="period-arrow">
                  <ArrowRight />
                </div>
                <div className="after">
                  <span>AFTER</span>
                  <strong>
                    {dateLabel(period.from)} – {dateLabel(period.to)}
                  </strong>
                  <p>
                    {period.from.slice(0, 4)} ·{' '}
                    {period.to >= day()
                      ? 'Period still in progress'
                      : `${length} complete calendar days`}
                  </p>
                </div>
              </div>
              <section className="panel">
                <TableWrap>
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Before</th>
                        <th>After</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows().map((r) => (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td>{fmt(r.before, r.format)}</td>
                          <td className="strong-cell">
                            {fmt(r.after, r.format)}
                          </td>
                          <td>
                            <Change
                              value={delta(r.after, r.before)}
                              inverse={r.inverse}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </section>
              <div className="insight-note">
                <CircleHelp />
                <div>
                  <h3>“After” does not automatically mean “because of”.</h3>
                  <p>
                    Higher sales may reflect more ad spend, Eid or summer
                    demand, discounts, new stock or tracking changes. Use a
                    controlled experiment or holdout to prove incremental
                    impact. This view describes the change; it does not prove
                    its cause.
                  </p>
                </div>
              </div>
              {trendChart}
            </>
          )}
          {view === 'campaigns' && (
            <>
              {metricCards}
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">CAMPAIGN PERFORMANCE</span>
                    <h2>Where your budget is going</h2>
                    <p>
                      Purchase-only returns. Generic conversions are shown
                      separately.
                    </p>
                  </div>
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search campaigns"
                      placeholder="Find a campaign…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {a ? (
                  <TableWrap>
                    <table>
                      <thead>
                        <tr>
                          <th>Campaign</th>
                          <th>Spend</th>
                          <th>Clicks</th>
                          <th>CTR</th>
                          <th>Purchases</th>
                          <th>Purchase value</th>
                          <th>ROAS</th>
                          <th>Cost / purchase</th>
                          <th>All primary conversions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignRows.map((r) => (
                          <tr key={r.id}>
                            <td className="campaign-name">{r.name}</td>
                            <td>{fmt(r.cost, 'money')}</td>
                            <td>{fmt(r.clicks)}</td>
                            <td>{fmt(r.ctr, 'percent')}</td>
                            <td>{fmt(r.purchases)}</td>
                            <td>{fmt(r.purchaseValue, 'money')}</td>
                            <td>
                              <Pill>{fmt(r.roas, 'ratio')}</Pill>
                            </td>
                            <td>{fmt(r.cpa, 'money')}</td>
                            <td>{fmt(r.conversions)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!campaignRows.length && (
                      <Empty title="No matching campaigns">
                        Try a different campaign name.
                      </Empty>
                    )}
                  </TableWrap>
                ) : (
                  <Empty title="Connect Google Ads to see campaigns">
                    The first sync must identify purchase conversion actions and
                    their values correctly.
                  </Empty>
                )}
                <p className="panel-foot">
                  Conversions are dated by ad interaction in this report.
                  Attribution can be fractional and revised. Ads value is not
                  collected revenue; spend is not the final invoice.
                </p>
              </section>
            </>
          )}
          {view === 'activity' && (
            <>
              <div className="metrics-grid">
                <Metric
                  label="Store orders placed"
                  value={w?.orders}
                  previous={wb?.orders}
                  help="All channels · grouped by order-created date"
                  icon={ShoppingBag}
                />
                <Metric
                  label="Recorded paid value"
                  value={w?.recordedPaidValue}
                  previous={wb?.recordedPaidValue}
                  format="money"
                  help="Orders with a paid date; not bank settlement"
                  icon={Wallet}
                  featured
                />
                <Metric
                  label="Cancelled orders"
                  value={w?.cancelledOrders}
                  previous={wb?.cancelledOrders}
                  inverse
                  help="Current status of the selected order cohort"
                  icon={X}
                />
                <Metric
                  label="Refunds on this cohort"
                  value={w?.refundValue}
                  previous={wb?.refundValue}
                  format="money"
                  inverse
                  help="Refunds recorded to date on these orders"
                  icon={RefreshCw}
                />
              </div>
              <div className="warning-box">
                Cash-on-delivery orders and “completed” status do not by
                themselves prove payment collection or delivery. A
                delivery-confirmed feed is required for delivered sales. These
                store figures must not be added to Ads-attributed purchases.
              </div>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">INTENT ≠ CONFIRMED OUTCOME</span>
                    <h2>The full picture, without double counting</h2>
                  </div>
                </div>
                <div className="event-grid">
                  {[
                    'form_enquiry',
                    'whatsapp_click',
                    'whatsapp_conversation',
                    'phone_click',
                    'answered_call',
                    'qualified_lead',
                    'add_to_cart',
                    'begin_checkout',
                    'delivery_confirmed',
                  ].map((type) => (
                    <div className="event-stat" key={type}>
                      <Pill
                        tone={
                          INTENT_EVENTS.includes(type) ? 'neutral' : 'success'
                        }
                      >
                        {INTENT_EVENTS.includes(type)
                          ? 'Intent event'
                          : 'Confirmed event'}
                      </Pill>
                      <strong>{fmt(events[type])}</strong>
                      <h3>{EVENT_TYPES[type as keyof typeof EVENT_TYPES]}</h3>
                      <p>
                        {events[type] === null
                          ? 'This event is not connected for the full period.'
                          : 'Event occurrences, not unique people.'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">RECENT ACTIVITY</span>
                    <h2>Results as they arrive</h2>
                    <p>
                      {mode === 'bridge'
                        ? bridgeState
                        : 'Snapshot view · not live'}{' '}
                      · displayed times are Cairo time
                    </p>
                  </div>
                  <div className="inline-actions">
                    <select
                      aria-label="Activity type"
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                    >
                      <option value="all">All event types</option>
                      {Object.entries(EVENT_TYPES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={poll}
                      disabled={mode !== 'bridge'}
                    >
                      <RefreshCw />
                      Refresh
                    </Button>
                  </div>
                </div>
                {activityRows.length ? (
                  <TableWrap>
                    <table>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Event</th>
                          <th>Channel recorded by source</th>
                          <th>Count</th>
                          <th>Meaning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityRows.slice(0, 60).map((r: any) => (
                          <tr key={r.id}>
                            <td>{dateTime(r.at)}</td>
                            <td>
                              {EVENT_TYPES[r.type as keyof typeof EVENT_TYPES]}
                            </td>
                            <td>{r.channel}</td>
                            <td>{r.count}</td>
                            <td>
                              <Pill>
                                {INTENT_EVENTS.includes(r.type)
                                  ? 'Intent only'
                                  : 'Recorded outcome'}
                              </Pill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="panel-foot">
                      Showing the latest {Math.min(60, activityRows.length)} of{' '}
                      {activityRows.length} available records, newest first.
                      This stream is independent of the report date filter. No
                      names, email addresses or phone numbers are exposed here.
                    </p>
                  </TableWrap>
                ) : (
                  <Empty
                    title="No activity records in this view"
                    icon={Activity}
                  >
                    No results can mean a missing connection, an untracked event
                    or no matching records—not necessarily zero leads.
                  </Empty>
                )}
              </section>
            </>
          )}
          {view === 'seo' && (
            <>
              <div className="notice">
                <Clock3 size={18} />
                <p>
                  Search Console daily dates use Pacific Time. Store reporting
                  uses Cairo time. Compare trends within each source; these are
                  not identical 24-hour sales windows.{' '}
                  <a
                    href="https://support.google.com/webmasters/answer/96568"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google’s date definitions
                  </a>
                </p>
              </div>
              {data.sources.seo.note && (
                <div className="notice">
                  <ShieldCheck size={18} />
                  <p>{data.sources.seo.note}</p>
                </div>
              )}
              <div className="metrics-grid">
                <Metric
                  label="Organic Google clicks"
                  value={s?.clicks}
                  previous={sb?.clicks}
                  help="Search Console · not paid clicks"
                  icon={MousePointer2}
                  featured
                />
                <Metric
                  label="Organic impressions"
                  value={s?.impressions}
                  previous={sb?.impressions}
                  help="How often ZEE appeared in Google Search"
                  icon={Eye}
                />
                <Metric
                  label="Organic click-through rate"
                  value={s?.ctr}
                  previous={sb?.ctr}
                  format="percent"
                  help="Clicks ÷ impressions for the selected period"
                  icon={TrendingUp}
                />
                <Metric
                  label="Average search position"
                  value={s?.position}
                  previous={sb?.position}
                  inverse
                  help="Impression-weighted; lower is generally better"
                  icon={Search}
                />
              </div>
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">UNPAID SEARCH</span>
                    <h2>Are more people finding ZEE?</h2>
                    <p>Do not credit paid-traffic growth to SEO articles.</p>
                  </div>
                </div>
                {s ? (
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={seoSeries}>
                        <CartesianGrid vertical={false} stroke="#e8edea" />
                        <XAxis
                          dataKey="date"
                          minTickGap={45}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis width={45} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Area
                          dataKey="clicks"
                          name="Organic clicks"
                          stroke="#17644f"
                          strokeWidth={3}
                          fill="#dcedda"
                          connectNulls={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty title="Organic reporting is separate">
                    Connect an Egypt-filtered Search Console report. Brand
                    queries such as “ZEE / زي” should be reviewed separately
                    from non-brand discovery.
                  </Empty>
                )}
              </section>
              <div className="insight-note">
                <Search />
                <div>
                  <h3>For the articles we worked on</h3>
                  <p>
                    Compare clicks and impressions for each launched URL, then
                    split brand/non-brand queries and Arabic/English pages. Use
                    GA4 for article-to-product clicks and purchasing journeys.
                    This first dashboard shows source totals; URL, query and GA4
                    journey breakdowns need an additional connector.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === 'changes' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CONTEXT FOR YOUR RESULTS</span>
                  <h2>What changed, and when?</h2>
                  <p>
                    This journal is saved on this browser only. Export it to
                    share with the team.
                  </p>
                </div>
                <div className="inline-actions">
                  <Button
                    variant="outline"
                    disabled={!notes.length}
                    onClick={() =>
                      download(
                        'ZEE-change-journal.csv',
                        csv([
                          ['Date', 'Type', 'Change'],
                          ...notes.map((n) => [n.date, n.type, n.title]),
                        ]),
                      )
                    }
                  >
                    <Download />
                    Export journal
                  </Button>
                  <Button onClick={() => setNoteOpen(true)}>
                    <Plus />
                    Add change
                  </Button>
                </div>
              </div>
              {notes.length ? (
                <div className="timeline">
                  {[...notes]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((n) => (
                      <div className="timeline-row" key={n.id}>
                        <span className="timeline-dot" />
                        <time>{n.date}</time>
                        <div>
                          <Pill>{n.type}</Pill>
                          <h3>{n.title}</h3>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setChangeDate(n.date);
                            setCompareType('change');
                            go('compare');
                          }}
                        >
                          Compare <ArrowRight />
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <Empty title="Add your first milestone" icon={Flag}>
                  Examples: articles launched on production, campaign budget
                  changed, Eid offer started, or a bestselling family returned
                  to stock.
                </Empty>
              )}
            </section>
          )}
          <div hidden={view !== 'connections'}>
            <DirectConnection key={clearGeneration} from={period.beforeFrom} to={period.to} onSnapshot={snapshot => {
              if (mode === 'bridge') throw Error('Stop the WordPress connection before using the direct API.');
              const merged = mergeSnapshot(data, snapshot, mode);
              flushSync(() => { setData(merged.data); setMode('import'); });
              setNotice('Direct Google report received. Refresh is managed in Data connections; source timestamps show data age.');
            }} />
          </div>
          {view === 'connections' && (
            <>
              <div className="connection-hero">
                <ShieldCheck size={34} />
                <div>
                  <h2>Public website. Private reporting data.</h2>
                  <p>
                    GitHub hosts the interface only. The private WordPress
                    connector uses ZEE’s own sign-in and shares aggregate
                    reporting with this tab. The bridge is installed on staging
                    and production; installation alone does not verify
                    production totals or connect external accounts.
                  </p>
                </div>
              </div>
              <div className="connection-grid">
                {SOURCES.map((key, i) => (
                  <section className="panel connection-card" key={key}>
                    <div className="connection-top">
                      <div className="source-logo">
                        {['G', 'W', '↗', 'S'][i]}
                      </div>
                      <Pill
                        tone={
                          data.sources[key].status === 'connected'
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {data.sources[key].status === 'connected'
                          ? mode === 'example'
                            ? 'Example only'
                            : mode === 'import'
                              ? 'Snapshot imported'
                              : stale(data.sources[key], clock)
                          : 'Not connected'}
                      </Pill>
                    </div>
                    <h2>{SOURCE_NAMES[key]}</h2>
                    <p>
                      {
                        [
                          'Spend, clicks, campaigns and purchase-only attribution. Correct account: 206-762-3227.',
                          'Orders, payment dates, current status and refunds. Staging remains clearly labelled.',
                          'Forms, WhatsApp, calls, checkout and delivery. Each event needs its own verified source.',
                          'Unpaid Google clicks, impressions, CTR and position. Egypt-filtered reporting.',
                        ][i]
                      }
                    </p>
                    <div className="connection-meta">
                      <span>Last source sync</span>
                      <strong>{dateTime(data.sources[key].lastSync)}</strong>
                      <span>Coverage</span>
                      <strong>
                        {data.sources[key].from
                          ? `${data.sources[key].from} → ${data.sources[key].to}`
                          : 'Not available'}
                      </strong>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setConnectionOpen(true)}
                    >
                      <Link2 />
                      {key === 'events' || key === 'seo'
                        ? 'Connection requirements'
                        : 'Open private connection'}
                    </Button>
                  </section>
                ))}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Working with an export?</h2>
                    <p>
                      A validated ZEE JSON snapshot stays in this tab’s memory.
                      It is not uploaded or auto-refreshed.
                    </p>
                  </div>
                  <Button onClick={() => file.current?.click()}>
                    <Upload />
                    Open reporting export
                  </Button>
                </div>
                <div className="inline-actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      download(
                        'ZEE-example-format.json',
                        JSON.stringify(exampleData(), null, 2),
                        'application/json',
                      )
                    }
                  >
                    <FileJson />
                    Download example format
                  </Button>
                  <Button variant="outline" onClick={loadExample}>
                    <Eye />
                    Explore example
                  </Button>
                  <Button
                    variant="outline"
                    onClick={disconnect}
                    disabled={mode === 'empty'}
                  >
                    <Unplug />
                    Disconnect & clear data
                  </Button>
                </div>
              </section>
            </>
          )}
          {view === 'guide' && (
            <>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">READ THE NUMBERS CORRECTLY</span>
                    <h2>A measurement guide for the whole team</h2>
                  </div>
                  <CircleHelp />
                </div>
                <Accordion>
                  {[
                    [
                      'What does “live” really mean?',
                      'The private connection requests a fresh snapshot every minute while its window stays open. That is not a promise that Google has processed everything. Ads clicks and costs typically update hourly; conversion and search-term reporting can take longer. Each source shows its own last-sync time. An imported export never becomes a live feed.',
                    ],
                    [
                      'What is a lead—and what is not?',
                      'An accepted form submission is a recorded enquiry. A WhatsApp-button click only means someone clicked; they may never send a message. A confirmed WhatsApp conversation needs messaging-platform or CRM evidence. Similarly, phone clicks are separate from answered calls. Event totals are not unique people and should not be summed as “all leads”.',
                    ],
                    [
                      'Can I trust ROAS as profit?',
                      'No. Purchase ROAS is the value of Ads-attributed purchase conversions divided by ad spend. For example, EGP 30,000 of purchase value divided by EGP 10,000 spend is 3× ROAS. Product costs, delivery, discounts, tax, refunds and agency costs determine profit. ZEE must first confirm which purchase actions and values its account records.',
                    ],
                    [
                      'Why are store orders different from Ads purchases?',
                      'WooCommerce counts orders recorded by the store. Google Ads attributes credit to ad interactions under its conversion settings and windows, sometimes fractionally. They use different clocks and can overlap. Never add these two numbers. This dashboard dates Ads metrics by interaction date and store cohorts by order-created date.',
                    ],
                    [
                      'Does “paid” mean the money reached ZEE?',
                      'The store metric means an order has a WooCommerce payment date. It is not an accounting reconciliation. Cash-on-delivery or integrations may mark orders paid before cash is collected. Completed is also not proof of delivery. Use gateway settlement and approved courier or CRM delivery records for those stronger claims.',
                    ],
                    [
                      'How should we compare before and after?',
                      'Use complete 7-, 28- or 56-day periods so weekdays are balanced. Log the production launch—not a staging publication date. Check comparable budgets, promotions, stock, holidays and tracking setup. Recent purchases can be attributed later, so revisit results. A before/after comparison does not prove the articles caused an increase.',
                    ],
                    [
                      'What should we check before trusting the first report?',
                      'Reconcile a complete day against the Ads account, including account currency/time zone and purchase conversion actions. Reconcile a sample of store order statuses and refunds. Test successful forms, a WhatsApp click, a confirmed message, an answered call and a delivery separately. Confirm retries do not double-count. Verify unauthorized users cannot receive reporting data.',
                    ],
                    [
                      'Why do some cards show a dash?',
                      'A dash means unavailable or undefined—not zero. The source may not be connected, may not cover the entire selected period, or an event may not be tracked. ROAS and cost-per-purchase are undefined when their denominator is zero. No missing history is invented.',
                    ],
                    [
                      'Who can see my data?',
                      'Anyone can load the public interface and synthetic example. Real data is not bundled in GitHub. A reporting export is held in this browser tab’s memory until it is cleared or closed. The private connector requires an authorized WordPress login. Never put passwords, tokens or customer contacts in exports or the change journal.',
                    ],
                  ].map(([title, text], i) => (
                    <AccordionItem key={title} value={String(i)}>
                      <AccordionTrigger>{title}</AccordionTrigger>
                      <AccordionContent>
                        <p>{text}</p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
              <section className="panel sources-panel">
                <h2>Official references</h2>
                <a
                  href="https://support.google.com/google-ads/answer/2544985"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Ads reporting freshness <ExternalLink size={15} />
                </a>
                <a
                  href="https://developers.google.com/google-ads/scripts/docs/concepts/reports"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Ads reporting scripts <ExternalLink size={15} />
                </a>
                <a
                  href="https://developer.woocommerce.com/docs/features/orders/wc-get-orders/"
                  target="_blank"
                  rel="noreferrer"
                >
                  WooCommerce order queries <ExternalLink size={15} />
                </a>
                <a
                  href="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages"
                  target="_blank"
                  rel="noreferrer"
                >
                  What GitHub Pages hosts <ExternalLink size={15} />
                </a>
              </section>
            </>
          )}
          <footer className="workspace-footer">
            <span>
              ZEE Growth <span className="footer-dot">·</span> Clear numbers.
              Better decisions.
            </span>
            <span>
              {mode === 'example'
                ? 'Synthetic example · not real ZEE results'
                : data.generatedAt
                  ? `Snapshot: ${dateTime(data.generatedAt)}`
                  : 'No live business data connected'}
            </span>
          </footer>
        </main>
      </div>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="Import a ZEE reporting JSON file"
        onChange={importFile}
      />
      <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
        <DialogContent className="connection-dialog">
          <DialogHeader>
            <div className="empty-icon">
              <LockKeyhole />
            </div>
            <DialogTitle>Connect through ZEE’s own website</DialogTitle>
            <DialogDescription>
              The existing bridge is installed on staging and production. This
              opens its private reporting page; it does not install or update a
              plugin. The public dashboard never asks for your Google or
              WordPress password.
            </DialogDescription>
          </DialogHeader>
          <ol className="connection-steps">
            <li>
              <strong>1. Choose the store you want to review</strong>
              <span>
                Choose production for actual store figures, or staging for test
                data. Sign in on that WordPress site. If sign-in fails, ask
                Mostafa to verify your reporting access; do not create a new
                account here.
              </span>
            </li>
            <li>
              <strong>2. Allow this tab to view reports</strong>
              <span>
                Click “Allow this dashboard tab to view reports” in the
                WordPress window. The existing connector reads orders and
                updates its own cached totals. Partial days stay unavailable
                until collection finishes.
              </span>
            </li>
            <li>
              <strong>3. Keep the connection window open</strong>
              <span>
                This tab requests reports every minute. Google Ads and other
                feeds still need their own setup. Check Data connections for the
                exact requirements; refresh frequency is not a guarantee of
                fresh source data.
              </span>
            </li>
          </ol>
          <label className="field-label">
            Connection environment
            <select
              value={bridgeOrigin}
              onChange={(e) => setBridgeOrigin(e.target.value)}
            >
              <option value={BRIDGE_ORIGINS[0]}>
                Staging — test figures only
              </option>
              <option value={BRIDGE_ORIGINS[1]}>
                Production — existing installed bridge
              </option>
            </select>
          </label>
          <Button onClick={connect}>
            <ExternalLink />
            Open ZEE connection
          </Button>
          <p className="dialog-note">{bridgeState}</p>
          <div className="dialog-divider">Or explore without connecting</div>
          <div className="inline-actions">
            <Button
              variant="outline"
              onClick={() => {
                setConnectionOpen(false);
                file.current?.click();
              }}
            >
              <Upload />
              Open export
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                loadExample();
                setConnectionOpen(false);
              }}
            >
              <Eye />
              Example data
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="note-dialog">
          <DialogHeader>
            <DialogTitle>Log a change</DialogTitle>
            <DialogDescription>
              Keep context beside the numbers. Saved in this browser only; no
              shared cloud journal yet.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveNote}>
            <label className="field-label">
              What changed?
              <input
                required
                maxLength={160}
                placeholder="e.g. Approved articles launched on production"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="field-label">
                Date
                <input
                  required
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                />
              </label>
              <label className="field-label">
                Type
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                >
                  {[
                    'Content',
                    'Ads budget',
                    'Promotion',
                    'Inventory',
                    'Tracking',
                    'Website',
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button type="submit">
              <Check />
              Save change
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
