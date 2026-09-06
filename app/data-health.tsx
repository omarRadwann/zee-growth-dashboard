'use client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  CheckCircle2,
  Link2,
  ArrowRight,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { coverageStatus, latestWindow } from '@/lib/readiness.mjs';
import { day, stale } from '@/lib/metrics.mjs';
import type { ReportData } from '@/lib/report-types';
import './data-health.css';

export const SOURCE_SETUP = [
  {
    key: 'woo',
    name: 'Store sales',
    owner: 'Mostafa + store administrator',
    detail:
      'The reporting bridge was installed on production on 6 September. Sign-in and production totals still need verification. This website does not install or update plugins.',
    steps: [
      'Open the private connection and sign in on zee-official.com.',
      'Click “Allow this dashboard tab to view reports”. The existing connector reads and caches daily totals; it does not edit orders.',
      'Compare a complete day with WooCommerce using the same order-created dates. Verify paid, cancelled and refunded orders.',
      'Mostafa must verify server scheduling before anyone promises unattended updates.',
    ],
    scope:
      'Orders, recorded payment value, cancellations, completed status and refunds.',
  },
  {
    key: 'ads',
    name: 'Google Ads',
    owner: 'Existing Google Ads administrator',
    detail:
      'The reporting user had Read-only access when checked on 6 September. The prepared script has not been installed or authorized in Google Ads.',
    steps: [
      'Use the existing ZEE account, not the unfinished signup account.',
      'An existing administrator installs and authorizes the reporting-only script, after reviewing its destination and purchase actions.',
      'Verify one complete day against Google Ads, then schedule it. Purchase actions must exclude duplicate purchase goals.',
      'Read-only API access is an alternative, but needs a private backend, OAuth and a Google Ads developer token. None is configured here.',
    ],
    scope:
      'Spend, campaign performance, clicks and verified purchase attribution—not a total of every conversion goal.',
  },
  {
    key: 'seo',
    name: 'Organic search',
    owner: 'Search Console property owner / SEO team',
    detail:
      'Account access alone is not an automatic feed. Daily reporting and URL/query reports need exports or a separately authorized adapter.',
    steps: [
      'Select the zee-official.com Search Console property, Search type Web and Country Egypt.',
      'Export complete dates for trend comparisons. Export Pages and Queries separately to inspect article URLs and Arabic / English terms.',
      'Open the CSV files in Performance explorer. They remain private snapshots, not live connections.',
      'An automatic feed needs a privately hosted, authorized Search Console adapter. Search Console dates stay in Pacific Time, not Cairo time.',
    ],
    scope:
      'Clicks, impressions, CTR and average position. Query exports omit anonymized queries and are not whole-site totals.',
  },
  {
    key: 'events',
    name: 'Enquiries & customer journey',
    owner: 'Mostafa + marketing / CRM team',
    detail:
      'GA4, confirmed WhatsApp conversations, answered calls and delivery records are not connected. A click does not prove an enquiry or sale.',
    steps: [
      'Identify ZEE’s existing GA4 property, tag setup, forms, WhatsApp platform, call platform and CRM.',
      'Audit existing tracking before adding anything. Any production tag, plugin or setting change needs your prior approval.',
      'Test accepted forms, WhatsApp clicks and actual conversations separately. Use stable IDs to prevent duplicate events.',
      'Connect delivery and cash collection only from approved operations records. Do not infer them from WooCommerce “completed”.',
    ],
    scope:
      'Keep each verified outcome separate. This dashboard does not claim profit, unique leads or confirmed delivery without those feeds.',
  },
];
type Props = {
  data: ReportData;
  mode: string;
  period: { from: string; to: string; beforeFrom: string; beforeTo: string };
  length: number;
  comparison: boolean;
  clock: number;
  onConnect: () => void;
  onWindow: (to: string) => void;
  onExplore: () => void;
  onExport: () => void;
};
export default function DataHealth(p: Props) {
  const ready = SOURCE_SETUP.filter(
    (s) => coverageStatus(p.data, s.key, p.period).current,
  ).length;
  return (
    <section className="dh-panel panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REPORTING READINESS</span>
          <h2>Know which numbers you can use</h2>
          <p>
            {ready} of 4 source groups cover {p.period.from} to {p.period.to}.
            This is data coverage, not a business-performance score.
          </p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </div>
      <Progress
        value={ready * 25}
        aria-label="Source groups covering the selected period"
      />
      <div className="dh-grid">
        {SOURCE_SETUP.map((item) => {
          const status = coverageStatus(p.data, item.key, p.period);
          const src = p.data.sources[item.key];
          const suggestion = latestWindow(
            p.data,
            item.key,
            p.length,
            day(new Date(p.clock)),
            p.comparison,
          );
          return (
            <article className="dh-source" key={item.key}>
              <div className="dh-source-title">
                <h3>{item.name}</h3>
                <span
                  className={'pill ' + (status.current ? 'success' : 'neutral')}
                >
                  {!status.connected
                    ? 'No feed in this tab'
                    : p.mode === 'example'
                      ? 'Example only'
                      : p.mode === 'import'
                        ? 'Snapshot'
                        : stale(src, p.clock)}
                </span>
              </div>
              <p>{item.scope}</p>
              <dl>
                <div>
                  <dt>Available dates</dt>
                  <dd>
                    {status.connected
                      ? `${src.from} → ${src.to}`
                      : 'Not received'}
                  </dd>
                </div>
                <div>
                  <dt>Selected period</dt>
                  <dd>
                    {status.current
                      ? 'Complete coverage'
                      : status.connected
                        ? 'Outside available history'
                        : 'Awaiting data'}
                  </dd>
                </div>
                <div>
                  <dt>Previous period</dt>
                  <dd>
                    {status.before ? 'Complete coverage' : 'Not enough history'}
                  </dd>
                </div>
              </dl>
              {suggestion && suggestion.to !== p.period.to && (
                <Button
                  variant="outline"
                  onClick={() => p.onWindow(suggestion.to)}
                >
                  Use latest {p.comparison ? 'comparable' : 'complete'}{' '}
                  {p.length} days <ArrowRight />
                </Button>
              )}
              <Accordion>
                <AccordionItem value="setup">
                  <AccordionTrigger>
                    Connection steps & responsibility
                  </AccordionTrigger>
                  <AccordionContent>
                    <p>
                      <strong>{item.owner}</strong>
                    </p>
                    <p>{item.detail}</p>
                    <ol>
                      {item.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </article>
          );
        })}
      </div>
      <div className="inline-actions">
        <Button onClick={p.onConnect}>
          <Link2 />
          Connect existing bridge
        </Button>
        <Button variant="outline" onClick={p.onExplore}>
          Explore real CSV reports <ArrowRight />
        </Button>
        <Button
          variant="outline"
          onClick={p.onExport}
          disabled={
            !SOURCE_SETUP.some(
              (s) => p.data.sources[s.key]?.status === 'connected',
            )
          }
        >
          <Download />
          Save private snapshot
        </Button>
      </div>
      <p className="dh-foot">
        <CheckCircle2 size={16} /> Snapshot files contain business totals. Share
        them only with approved teammates. Nothing is uploaded to GitHub.
      </p>
    </section>
  );
}
