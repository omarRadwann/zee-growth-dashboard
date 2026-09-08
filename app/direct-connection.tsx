'use client';
import './direct-connection.css';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { reportSnapshot, reportingUrl } from '@/lib/direct-report.mjs';
type Identity = { initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, options: { theme: string; size: string }) => void };
type GAReport = { rows: { date: string; event: string; count: number }[]; metadata?: { subjectToThresholding?: boolean; samplingMetadatas?: unknown[] }; generatedAt: string };
const sources = ['ads', 'search-console', 'ga4'] as const;
export default function DirectConnection({ from, to, onSnapshot }: { from: string; to: string; onSnapshot: (report: ReturnType<typeof reportSnapshot>) => void }) {
  const [url, setUrl] = useState(''), [origin, setOrigin] = useState(''), [token, setToken] = useState('');
  const [message, setMessage] = useState('Connect your hosted reporting API, then sign in with an approved Google account.');
  const [status, setStatus] = useState<Record<string, string>>({}), [ga, setGa] = useState<GAReport | null>(null);
  const [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const button = useRef<HTMLDivElement>(null), callback = useRef(onSnapshot), generation = useRef(0);
  useEffect(() => { callback.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => () => { generation.current++; }, []);
  function stop() { generation.current++; setToken(''); setGa(null); setStatus({}); setMessage('Refresh stopped. Loaded reports remain until Disconnect & clear data.'); }
  async function connect() {
    const attempt = ++generation.current; setBusy(true); setToken(''); setGa(null); setStatus({});
    try {
      const base = reportingUrl(url);
      const response = await fetch(base + '/config', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('Backend not reachable or website origin not allowed.');
      const config = await response.json() as { clientId?: string; signInConfigured?: boolean };
      if (!config.signInConfigured || !(config.clientId || '').endsWith('.apps.googleusercontent.com')) throw Error('Backend is running, but its Google sign-in client ID and approved team list still need configuration.');
      if (!(window as unknown as { google?: unknown }).google) await new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.onload = () => resolve(); script.onerror = () => reject(Error('Google sign-in could not load.')); document.head.appendChild(script); });
      if (attempt !== generation.current) return;
      const identity = (window as unknown as { google: { accounts: { id: Identity } } }).google.accounts.id;
      identity.initialize({ client_id: config.clientId!, callback: result => { if (generation.current === attempt) { setOrigin(base); setToken(result.credential); setMessage('Signed in. Each source is checked independently.'); } } });
      if(button.current) { button.current.replaceChildren(); identity.renderButton(button.current, { theme: 'outline', size: 'large' }); }
      setMessage('Use the Google button below. Only approved team accounts can read reports.');
    } catch(error) { if(attempt === generation.current) setMessage((error as Error).message); }
    finally { if(attempt === generation.current) setBusy(false); }
  }
  useEffect(() => {
    if (!token || !origin) return;
    let cancelled = false; const controller = new AbortController(), attempt = generation.current;
    const load = async () => {
      for (const source of sources) {
        if (cancelled) return; setStatus(previous => ({ ...previous, [source]: 'Refreshing…' }));
        try {
          const response = await fetch(`${origin}/v1/${source}?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]) });
          const report = await response.json() as GAReport & { error?: string; upstreamStatus?: number }; if (cancelled || attempt !== generation.current) return;
          if (response.status === 401 || response.status === 403) { setToken(''); throw Error('Sign in again, or ask Mostafa to approve your Google account.'); }
          if (!response.ok) throw Error(`${report.error || 'REPORT_FAILED'}${report.upstreamStatus ? ` (Google ${report.upstreamStatus})` : ''}`);
          if (source === 'ga4') {
            if (!Array.isArray(report.rows) || report.rows.some(row => typeof row.event !== 'string' || !Number.isFinite(row.count) || row.count < 0)) throw Error('Invalid GA4 event report.');
            setGa(report);
          } else callback.current(reportSnapshot(report));
          setStatus(previous => ({ ...previous, [source]: `Received · ${new Date(report.generatedAt).toLocaleTimeString()}` }));
        } catch(error) { if (!cancelled && attempt === generation.current) setStatus(previous => ({ ...previous, [source]: (error as Error).message })); }
      }
    };
    void load(); const timer = window.setInterval(() => { if (!document.hidden) setRefresh(n => n + 1); }, 300000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); };
  }, [token, origin, from, to, refresh]);
  const totals = new Map<string, number>(); ga?.rows.forEach(row => totals.set(row.event, (totals.get(row.event) || 0) + row.count));
  return <section className="panel direct-connection"><span className="eyebrow">DIRECT GOOGLE API</span><h2>Google Ads, Search Console & GA4</h2><p>No Google Ads script required. Refreshes every five minutes while this tab is open and signed in. Google processing delays still apply.</p>
    <label htmlFor="reporting-origin">Reporting backend URL</label><div className="direct-controls"><input id="reporting-origin" type="url" value={url} disabled={Boolean(token)} placeholder="https://your-reporting-service.run.app" onChange={event => setUrl(event.target.value)} /><Button disabled={busy || Boolean(token)} onClick={() => void connect()}>{busy ? 'Checking…' : 'Connect & sign in'}</Button>{token && <><Button variant="outline" onClick={() => setRefresh(n => n + 1)}>Refresh reports</Button><Button variant="outline" onClick={stop}>Stop refresh</Button></>}</div>
    <output>{message}</output><div ref={button}/><p className="lens-footnote">History: {from} → {to}, including comparison dates. Maximum 186 days. Choose an earlier ending date if Search Console is not final.</p>
    <div className="direct-status">{sources.map(source => <div key={source}><strong>{source === 'ads' ? 'Google Ads' : source === 'ga4' ? 'GA4 events' : 'Search Console'}</strong><p>{status[source] || 'Not received'}</p></div>)}</div>
    {ga && <div><h3>GA4 event counts · requested history</h3><p>Events are not unique leads, confirmed delivery or collected revenue. Includes comparison dates.</p>{(ga.metadata?.subjectToThresholding || ga.metadata?.samplingMetadatas?.length) ? <p className="warning-box">Google applied thresholding or sampling. Figures may be incomplete.</p> : null}<div className="table-scroll"><table><thead><tr><th>Event</th><th>Count</th></tr></thead><tbody>{[...totals].sort((a,b) => b[1]-a[1]).slice(0,50).map(([name,count]) => <tr key={name}><td>{name}</td><td>{count.toLocaleString()}</td></tr>)}</tbody></table></div><p className="lens-footnote">Top 50 events. No user identities are included.</p></div>}
  </section>;
}
