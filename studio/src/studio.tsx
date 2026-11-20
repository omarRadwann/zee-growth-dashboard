'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, CalendarDays, Check, CircleAlert, Clock3, Database, Download, Globe2, LayoutGrid, LineChart as TrendIcon, ListChecks, Plus, RefreshCw, Search, ShoppingBag, Target, Trash2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AdsFileReport, CommerceSignals, saveCsv } from './extras';

type Source = 'gsc'|'ga'|'ads';
type View = 'overview'|Source|'sources'|'journal';
type Row = { label:string; [key:string]:string|number|null|undefined };
type Values = Record<string,number|null|undefined>;
type Feed = {status:'ready'|'setup'|'error'; checkedAt:string; code?:string; message?:string; name?:string; account?:string; currency?:string; timeZone?:string; current?:Values; prior?:Values; daily?:Row[]; priorDaily?:Row[]; rows?:Row[]; notes?:string; cap?:number; thresholded?:boolean; sampled?:boolean; otherRow?:boolean; stale?:boolean; retryCode?:string; rowCount?:number; scope?:string[]; warnings?:{label:string;code:string}[]};
type Mode = 'previous'|'year'|'custom'|'off';
type Range = {from:string;to:string;days:number;priorFrom:string|null;priorTo:string|null;stableEnd:string;compare:Mode;comparisonUnavailable?:boolean};
type Packet = {range:Range;sources:Partial<Record<Source,Feed>>};
type Metric = {id:string;label:string;kind?:'money'|'percent'|'decimal';lower?:boolean};
const searchMetrics:Metric[]=[{id:'clicks',label:'Search clicks'},{id:'impressions',label:'Impressions'},{id:'ctr',label:'Click-through rate',kind:'percent'},{id:'position',label:'Avg. position',kind:'decimal',lower:true}];
const gaMetrics:Metric[]=[{id:'sessions',label:'Sessions'},{id:'ecommercePurchases',label:'Ecommerce purchases'},{id:'purchaseRevenue',label:'Purchase revenue',kind:'money'},{id:'totalUsers',label:'Users'},{id:'engagedSessions',label:'Engaged sessions'},{id:'engagementRate',label:'Engagement rate',kind:'percent'}];
const adsMetrics:Metric[]=[{id:'cost',label:'Ad spend',kind:'money'},{id:'clicks',label:'Ad clicks'},{id:'conversions',label:'Ads conversions',kind:'decimal'},{id:'conversionValue',label:'Conversion value',kind:'money'},{id:'cpc',label:'Avg. CPC',kind:'money',lower:true},{id:'impressions',label:'Impressions'},{id:'ctr',label:'Click-through rate',kind:'percent'}];
const sets={gsc:searchMetrics,ga:gaMetrics,ads:adsMetrics};
const meta={gsc:{name:'Search Console',short:'Organic Search',icon:Search,copy:'Google Web Search visibility, queries and landing pages.'},ga:{name:'Google Analytics',short:'Site Analytics',icon:Activity,copy:'Sessions, audience and measured ecommerce outcomes.'},ads:{name:'Google Ads',short:'Paid Media',icon:Target,copy:'Campaign spending, engagement and configured conversions.'}};
const navigation = [{id:'overview',title:'Overview',icon:LayoutGrid},{id:'gsc',title:'Organic Search',icon:Search},{id:'ga',title:'Site Analytics',icon:Activity},{id:'ads',title:'Paid Media',icon:Target},{id:'sources',title:'Data Sources',icon:Database},{id:'journal',title:'Change Journal',icon:ListChecks}] as const;
const copy = {overview:'A single view of search visibility, site activity and advertising.',gsc:'Follow the searches and landing pages that bring visitors to ZEE.',ga:'Understand acquisition, engagement and measured purchases.',ads:'Track campaign performance without changing budgets or settings.',sources:'Check reporting access, Google coverage and source freshness.',journal:'Record releases and promotions alongside the dates you measure.'};
const isoDay=(s:string,i:number)=>new Date(Date.parse(`${s}T00:00:00Z`)+i*86400000).toISOString().slice(0,10);
const nfmt=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1});
function format(value:unknown,m:Metric,currency?:string) {
  if(typeof value!=='number'||!Number.isFinite(value)) return '—';
  if(m.kind==='money') return `${currency??''} ${nfmt.format(value)}`.trim();
  if(m.kind==='percent') return `${value.toFixed(2)}%`;
  if(m.kind==='decimal') return nfmt.format(value);
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
}
const dateText=(s:string,year=false)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'));
const period=(a:string,b:string)=>`${dateText(a,a.slice(0,4)!==b.slice(0,4))} – ${dateText(b,true)}`;
function delta(a:unknown,b:unknown,m:Metric) {
  if(typeof a!=='number'||typeof b!=='number'||!Number.isFinite(a)||!Number.isFinite(b)) return null;
  const raw=a-b;
  const d=m.kind==='percent'||m.id==='position'?raw:b>0?(a-b)/b*100:null;
  if(d===null) return null;
  const rounded=Number(d.toFixed(1));
  return {text:`${rounded>0?'+':''}${nfmt.format(rounded)}${m.kind==='percent'?' pp':m.id==='position'?'':'%'}`,mood:!rounded?'neutral':((raw>0)!==Boolean(m.lower))?'positive':'negative'};
}
function download(rows:(string|number|null|undefined)[][],name:string) {
  saveCsv(name,rows);
}
function exportContext(f:Feed|undefined,range:Range|undefined) {
  return [
    ['Source',f?.name],['Property or account',f?.account],['Start date',range?.from],['End date',range?.to],
    ['Comparison mode',range?.compare],['Comparison start',range?.priorFrom],['Comparison end',range?.priorTo],
    ['Scope',f?.scope?.join(' | ')||'Account'],['Currency',f?.currency],['Reporting timezone',f?.timeZone],
    ['Checked at (UTC)',f?.checkedAt],['Cached fallback',f?.stale?'Yes':'No'],
    ['Data warnings',f?.warnings?.map(x=>x.label+': '+x.code).join(' | ')],['Metric definitions',f?.notes],
  ];
}
function exportReport(source:Source,f:Feed,range:Range,group:string) {
  const metrics=sets[source];
  const row=(section:string,label:string,val:Values|Row|undefined)=>[section,label,...metrics.map(m=>val?.[m.id])];
  saveCsv('zee-'+source+'-'+range.from+'-'+range.to+'.csv',[...exportContext(f,range),['Section','Date or group',...metrics.map(m=>m.label)],
    row('Period total','Current',f.current),...(range.priorFrom?[row('Period total','Comparison',f.prior)]:[]),
    ...Array.from({length:range.days},(_,i)=>{const d=isoDay(range.from,i);return row('Daily current',d,f.daily?.find(v=>v.label===d));}),
    ...(range.priorFrom?Array.from({length:range.days},(_,i)=>{const d=isoDay(range.priorFrom!,i);return row('Daily comparison',d,f.priorDaily?.find(v=>v.label===d));}):[]),
    ...f.rows?.map(v=>row('Breakdown: '+group,v.label,v))??[],
  ]);
}
function SourcePip({f}:{f:Feed|undefined}) {
  return <span className={`pill ${f?.status==='ready'&&!f.stale?'is-ready':f?'is-warn':''}`}><i/>{f?.stale?'Cached result':f?.status==='ready'?'Connected':f?.status==='setup'?'Needs setup':f?'Unavailable':'Not checked'}</span>;
}
function Kpi({m,f,active,onClick,compare}:{m:Metric;f?:Feed;active:boolean;onClick:()=>void;compare:boolean}) {
  const d=delta(f?.current?.[m.id],f?.prior?.[m.id],m);
  return <button className={`kpi ${active?'selected':''}`} onClick={onClick} aria-pressed={active}><span className="kpi-label">{m.label}<span className="kpi-dot"/></span><strong>{format(f?.current?.[m.id],m,f?.currency)}</strong><span className="kpi-foot">{compare&&d?<><span className={`change ${d.mood}`}>{d.text}</span><small>vs prior period</small></>:<small>{f?.status==='ready'?'Selected period':'Awaiting source data'}</small>}</span></button>;
}
function Timeline({f,m,range,compare,loading}:{f?:Feed;m:Metric;range?:Range;compare:boolean;loading:boolean}) {
  const [tabular,setTabular]=useState(false);
  const rows=useMemo(()=>{
    if(!range)return [];
    const a=new Map(f?.daily?.map(r=>[r.label,r[m.id]])); const b=new Map(f?.priorDaily?.map(r=>[r.label,r[m.id]]));
    return Array.from({length:range.days},(_,i)=>{
      const date=isoDay(range.from,i);const priorDate=range.priorFrom?isoDay(range.priorFrom,i):null;
      return {date,priorDate,current:a.get(date)??null,prior:priorDate?b.get(priorDate)??null:null};
    });
  },[range,f,m.id]);
  const show=rows.some(r=>r.current!==null||(compare&&r.prior!==null));
  return <section className="panel timeline"><header className="panel-head"><div><h2>{m.label} over time</h2><p>{range?period(range.from,range.to):'Daily reporting trend'}</p></div><button className="button tiny" onClick={()=>setTabular(x=>!x)}>{tabular?<TrendIcon size={15}/>:<ListChecks size={15}/>} {tabular?'Chart':'Data table'}</button></header>
    {!show?<div className="empty chart-empty"><TrendIcon size={30}/><strong>{loading?'Fetching the selected period…':f?.status==='ready'?'No rows for this period':'No trend data available'}</strong><span>{f?.message??'No missing dates are filled with example values.'}</span></div>:tabular?<div className="scroll-table chart-table"><table><thead><tr><th>Date</th><th>{m.label}</th>{compare&&<th>Prior period</th>}</tr></thead><tbody>{rows.map(r=><tr key={r.date}><td>{dateText(r.date)}</td><td>{format(r.current,m,f?.currency)}</td>{compare&&<td>{format(r.prior,m,f?.currency)}</td>}</tr>)}</tbody></table></div>:<>
      <div className="chart" role="img" aria-label={`${m.label} trend for the selected reporting period. Use Data table for exact values.`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={rows} margin={{top:12,right:15,bottom:0,left:0}}><defs><linearGradient id="signal-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#71ae4b" stopOpacity={.32}/><stop offset="100%" stopColor="#71ae4b" stopOpacity={.025}/></linearGradient></defs><CartesianGrid stroke="#e6ebe4" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="date" tickFormatter={s=>dateText(s)} axisLine={false} tickLine={false} minTickGap={28} tickMargin={10} tick={{fill:'#5e6a60',fontSize:12}}/><YAxis width={52} reversed={m.id==='position'} tickFormatter={v=>m.kind==='percent'?`${compact.format(v)}%`:compact.format(v)} axisLine={false} tickLine={false} tick={{fill:'#5e6a60',fontSize:12}}/><Tooltip cursor={{stroke:'#91a58d',strokeDasharray:'4 4'}} labelFormatter={s=>dateText(String(s),true)} formatter={(v,name,item)=>[format(v,m,f?.currency),name==='Prior'&&item.payload?.priorDate?`Prior · ${dateText(item.payload.priorDate)}`:String(name)]} contentStyle={{border:'1px solid #d6dfd4',borderRadius:10,background:'#fff'}}/><Area type="monotone" connectNulls={false} dataKey="current" name="Current" stroke="#337043" strokeWidth={2.5} fill="url(#signal-fill)" dot={rows.length<=10?{r:2}:false} activeDot={{r:4}} isAnimationActive={false}/>{compare&&<Line type="monotone" connectNulls={false} dataKey="prior" name="Prior" stroke="#8a9f8c" strokeDasharray="5 5" strokeWidth={1.6} dot={false} isAnimationActive={false}/>}</AreaChart></ResponsiveContainer></div>
      <div className="legend"><span><i/>Current period</span>{compare&&<span><i className="dashed"/>Comparison {range?.priorFrom&&range.priorTo&&`· ${period(range.priorFrom,range.priorTo)}`}</span>}</div></>}
  </section>;
}
const breakdowns={gsc:[['query','Queries'],['page','Landing pages'],['device','Devices'],['country','Countries'],['searchAppearance','Search appearance']],ga:[['sessionDefaultChannelGroup','Channels'],['landingPage','Landing pages'],['deviceCategory','Devices'],['country','Countries']],ads:[['campaign','Campaigns']]};
function Breakdown({source,f,group,setGroup,range}:{source:Source;f?:Feed;group:string;setGroup:(v:string)=>void;range?:Range}) {
  const [find,setFind]=useState('');const [pg,setPg]=useState(0);const [sort,setSort]=useState('');const [descending,setDescending]=useState(true);
  const ms=sets[source].slice(0,source==='ga'?4:source==='ads'?5:4);
  const metric=sort||ms[0].id;
  const rows=useMemo(()=>[...f?.rows??[]].filter(r=>r.label?.toLowerCase().includes(find.trim().toLowerCase())).sort((a,b)=>{const x=a[metric];const y=b[metric]; if(x==null)return y==null?0:1;if(y==null)return -1;return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*(descending?-1:1);}),[f,find,metric,descending]);
  const page=Math.min(pg,Math.max(0,Math.ceil(rows.length/10)-1));const columns=breakdowns[source];
  function changeSort(k:string){if(metric===k)setDescending(v=>!v);else{setSort(k);setDescending(k!=='label');}setPg(0);}
  return <section className="panel"><header className="panel-head"><div><h2>{columns.find(x=>x[0]===group)?.[1]??'Breakdown'}</h2><p>{source==='ads'?'Configured conversions, not verified orders.':'Selected period, ranked by the requested source.'}</p></div><button className="button tiny" disabled={!rows.length} onClick={()=>download([...exportContext(f,range),['Breakdown',group],['Table filter',find],['Name',...ms.map(m=>m.label)],...rows.map(r=>[r.label,...ms.map(m=>r[m.id])])],`zee-${source}-${group}-${range?.to??'report'}.csv`)}><Download size={15}/> Export CSV</button></header><div className="table-controls">{columns.length>1&&<div className="segments" aria-label="Breakdown dimension">{columns.map(([id,label])=><button aria-pressed={group===id} className={group===id?'on':''} key={id} onClick={()=>{setGroup(id);setFind('');setPg(0);}}>{label}</button>)}</div>}<label className="search-field"><Search size={16}/><input value={find} onChange={e=>{setFind(e.target.value);setPg(0);}} placeholder="Filter rows" aria-label="Filter report rows"/></label></div>
    {rows.length?<><div className="scroll-table"><table><thead><tr><th aria-sort={metric==='label'?(descending?'descending':'ascending'):'none'}><button onClick={()=>changeSort('label')}>Name</button></th>{ms.map(m=><th key={m.id} aria-sort={metric===m.id?(descending?'descending':'ascending'):'none'}><button onClick={()=>changeSort(m.id)}>{m.label}{metric===m.id?(descending?' ▾':' ▴'):''}</button></th>)}</tr></thead><tbody>{rows.slice(page*10,page*10+10).map((r,i)=><tr key={`${r.id??r.label}-${i}`}><td dir="auto"><span className="cell-name" title={r.label}>{r.label}</span></td>{ms.map(m=><td key={m.id}>{format(r[m.id],m,f?.currency)}</td>)}</tr>)}</tbody></table></div><div className="pager"><span>{page*10+1}–{Math.min(rows.length,page*10+10)} of {rows.length} returned rows{f?.rowCount&&f.rowCount>(f.cap??0)?` · Google reported ${nfmt.format(f.rowCount)}`:''}</span><button className="button tiny" disabled={page===0} onClick={()=>setPg(page-1)}>Previous</button><button className="button tiny" disabled={(page+1)*10>=rows.length} onClick={()=>setPg(page+1)}>Next</button></div></>:<div className="empty compact-empty"><Search size={23}/><strong>{find?'No matching rows':'No breakdown rows available'}</strong></div>}
  </section>;
}
function SourceCards({sources,onOpen}:{sources:Packet['sources'];onOpen:(k:Source)=>void}) {
  return <div className="source-grid">{(Object.keys(meta) as Source[]).map(k=>{const f=sources[k];const Icon=meta[k].icon;return <section className="panel source-card" key={k}><div className="source-top"><span className={`source-icon ${k}`}><Icon size={19}/></span><SourcePip f={f}/></div><h3>{meta[k].name}</h3><p>{f?.message??meta[k].copy}</p>{f?.code&&<code className="error-code">{f.code}</code>}<div className="source-bottom">{f?.checkedAt?<small>Checked {new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Cairo'}).format(new Date(f.checkedAt))} Cairo</small>:<small>Not yet checked</small>}<button className="text-button" onClick={()=>onOpen(k)}>Open report</button></div></section>;})}</div>;
}
type Note={id:string;date:string;type:string;title:string;body:string};
function Journal() {
  const [notes,setNotes]=useState<Note[]>([]);const [ready,setReady]=useState(false);const [storageError,setStorageError]=useState(false);
  useEffect(()=>{try{const r=JSON.parse(localStorage.getItem('zee-studio-journal-v1')??'[]');if(Array.isArray(r))setNotes(r.filter(n=>n&&typeof n.id==='string'&&typeof n.date==='string'&&typeof n.title==='string'&&typeof n.body==='string'&&typeof n.type==='string').slice(0,500));}catch{setStorageError(true);}setReady(true);},[]);
  function update(n:Note[]){setNotes(n);try{localStorage.setItem('zee-studio-journal-v1',JSON.stringify(n));setStorageError(false);}catch{setStorageError(true);}}
  return <div className="split journal-grid"><section className="panel"><header className="panel-head"><div><h2>Release notes</h2><p>Kept in this browser. Export to share with the team.</p></div><button className="button tiny" disabled={!notes.length} onClick={()=>download([['Date','Type','Title','Note'],...notes.map(n=>[n.date,n.type,n.title,n.body])],'zee-change-journal.csv')}><Download size={15}/> Export</button></header>{notes.length?<ol className="notes">{[...notes].sort((a,b)=>b.date.localeCompare(a.date)).map(n=><li key={n.id}><span>{n.date} · {n.type}</span><strong>{n.title}</strong><p>{n.body}</p><button className="icon-button" aria-label={`Delete ${n.title}`} onClick={()=>{if(window.confirm('Remove this local journal entry?'))update(notes.filter(x=>x.id!==n.id));}}><Trash2 size={15}/></button></li>)}</ol>:<div className="empty"><ListChecks size={26}/><strong>No changes recorded</strong><span>Start with a release, offer, or measurement change.</span></div>}</section><section className="panel journal-form"><h2>Record a change</h2>{storageError&&<p role="alert">Browser storage was not available. Export entries to retain a copy.</p>}<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const d=new FormData(form);const title=String(d.get('title')??'').trim();if(!title||!ready||notes.length>=500)return;update([{id:crypto.randomUUID(),date:String(d.get('date')),type:String(d.get('type')),title,body:String(d.get('body')??'').trim()},...notes]);form.reset();}}><label>Date<input required type="date" name="date"/></label><label>Area<select name="type"><option>SEO release</option><option>Campaign</option><option>Promotion</option><option>Site change</option><option>Measurement</option></select></label><label>Title<input name="title" maxLength={100} required placeholder="e.g. Clogs metadata delivery verified"/></label><label>What changed?<textarea name="body" maxLength={1000} rows={4} placeholder="Affected pages, before and after, and factors to watch"/></label><button className="button primary" disabled={!ready||notes.length>=500}><Plus size={16}/> Add entry</button></form></section></div>;
}
type SitemapRow={label:string;lastRead?:string;pending:boolean;errors:number;warnings:number;submitted:number};
function Sitemaps(){const [report,set]=useState<{status:string;rows?:SitemapRow[];message?:string}>();useEffect(()=>{const a=new AbortController();fetch('/api/sitemaps',{signal:a.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(set).catch(()=>{if(!a.signal.aborted)set({status:'error',message:'The sitemap report is unavailable.'});});return()=>a.abort();},[]);return <section className="panel"><header className="panel-head"><div><h2>Search Console sitemaps</h2><p>Submitted XML sitemaps and last read status. This is not Google sitelink management.</p></div><Globe2 size={20}/></header>{report?.rows?.length?<div className="scroll-table"><table><thead><tr><th>Sitemap</th><th>Last read</th><th>Submitted</th><th>Errors</th><th>Warnings</th></tr></thead><tbody>{report.rows.map(r=><tr key={r.label}><td>{r.label}</td><td>{r.pending?'Pending':r.lastRead?.slice(0,10)??'—'}</td><td>{nfmt.format(r.submitted)}</td><td>{r.errors??'—'}</td><td>{r.warnings??'—'}</td></tr>)}</tbody></table></div>:<div className="empty compact-empty">{report?.message??(report?'No submitted sitemaps returned.':'Checking Google…')}</div>}</section>;}

const choices={
  devices:[['all','All devices'],['mobile','Mobile'],['desktop','Desktop'],['tablet','Tablet']],
  countries:[['egy','Egypt'],['all','All countries']],
  gaCountries:[['all','All countries'],['EG','Egypt']],
  channel:[['all','All channels'],['organic','Organic Search']],
  gscType:[['web','Web'],['image','Image'],['video','Video'],['news','News tab']],
  gscLanguage:[['all','All URLs'],['ar','Arabic /ar/ URLs'],['en','Other URLs']],
  gscBrand:[['all','All queries'],['brand','Known ZEE brand terms'],['nonbrand','Exclude known ZEE brand terms']],
};
function SelectControl({name,value,onChange,options}:{name:string;value:string;onChange:(v:string)=>void;options:string[][]}) {
  return <label className="filter-label"><span>{name}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>;
}
function Quality({f,range,comparison}:{f:Feed;range:Range;comparison:boolean}) {
  const days=new Set(f.daily?.map(r=>r.label)).size;
  const prior=new Set(f.priorDaily?.map(r=>r.label)).size;
  const date = new Date(f.checkedAt);
  return <div className="quality-strip" aria-label="Report coverage">
    <span><Clock3 size={15}/> {Number.isFinite(date.getTime())?'Checked '+date.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'})+' Cairo':'No check timestamp'}</span>
    <span>{days}/{range.days} daily rows reported{comparison?' · '+prior+'/'+range.days+' comparison days':''}</span>
    {f.scope?.length&&<span title={f.scope.join(' · ')}>{f.scope.join(' · ')}</span>}
  </div>;
}
export default function Studio() {
  const [view,setView]=useState<View>('overview');
  const [days,setDays]=useState('28');
  const [custom,setCustom]=useState({from:'',to:''});
  const [applied,apply]=useState({from:'',to:''});
  const [mode,setMode]=useState<Mode>('previous');
  const [priorDraft,setPriorDraft]=useState('');
  const [priorStart,setPriorStart]=useState('');
  const [overviewSource,choose]=useState<Source>('gsc');
  const [metric,setMetric]=useState('');
  const [groups,setGroups]=useState({gsc:'query',ga:'sessionDefaultChannelGroup',ads:'campaign'});
  const defaults={country:'egy',device:'all',gscType:'web',gscLanguage:'all',gscBrand:'all',queryText:'',pageText:''};
  const [gsc,setGsc]=useState(defaults);
  const [searchDraft,draftSearch]=useState({queryText:'',pageText:''});
  const [ga,setGa]=useState({channel:'all',gaCountry:'all',gaDevice:'all'});
  const [packet,setPacket]=useState<Packet>();
  const [pending,setPending]=useState(true);
  const [error,setError]=useState('');
  const [refresh,doRefresh]=useState(0);
  const [settled,setSettled]=useState('');
  const refreshTracker=useRef(0);
  useEffect(()=>{
    function sync() {
      const key=location.hash.slice(1);
      if(key==='report-main')return;
      setView(navigation.some(n=>n.id===key)?key as View:'overview');
      setMetric('');
    }
    sync();window.addEventListener('hashchange',sync);
    return()=>window.removeEventListener('hashchange',sync);
  },[]);
  const detail=view==='gsc'||view==='ga'||view==='ads';
  const source:Source=detail?view:overviewSource;
  const group=groups[source];
  const metrics=sets[source];
  const currentMetric=metrics.find(m=>m.id===metric)??metrics[0];
  const validComparisonMode=mode==='custom'&&!priorStart?'previous':mode;
  const filters=new URLSearchParams({days:days==='custom'?'28':days,compare:validComparisonMode});
  if(days==='custom'&&applied.from&&applied.to){filters.set('from',applied.from);filters.set('to',applied.to);}
  if(validComparisonMode==='custom')filters.set('compareFrom',priorStart);
  if(detail){filters.set('source',source);filters.set('group',group);}
  if(!detail||source==='gsc')for(const [k,v] of Object.entries(gsc))if(v)filters.set(k,v);
  if(!detail||source==='ga')for(const [k,v] of Object.entries(ga))filters.set(k,v);
  const query=filters.toString();
  const requestKey=query+'|'+refresh;
  const reportingView=view!=='journal';
  useEffect(()=>{
    if(!reportingView)return;
    const abort=new AbortController();
    setPending(true);setError('');
    const force=refresh>0&&refreshTracker.current!==refresh;
    refreshTracker.current=refresh;
    fetch('/api/reports?'+query+(force?'&refresh=1':''),{signal:abort.signal,cache:'no-store'}).then(async r=>{
      const j=await r.json().catch(()=>null);
      if(!r.ok||!j?.sources||!j?.range)throw Error(j?.message??(r.status===401?'Sign in to the private server to view these reports.':'This page needs the private reporting server; GitHub Pages cannot run the API.'));
      return j as Packet;
    }).then(result=>{
      if(!abort.signal.aborted){setPacket(result);setSettled(requestKey);}
    }).catch(e=>{
      if(!abort.signal.aborted){setError(e.message);setPacket(undefined);setSettled(requestKey);}
    }).finally(()=>{if(!abort.signal.aborted)setPending(false);});
    return()=>abort.abort();
  },[query,refresh,requestKey,reportingView]);
  const latest=settled===requestKey?packet:undefined;
  const f=latest?.sources[source];
  const range=latest?.range;
  const compare=!!range?.priorFrom&&!range.comparisonUnavailable;
  const dataView=view==='overview'||detail;
  const loading=pending||settled!==requestKey;
  const currentSources=latest?.sources??{};
  const available=Object.values(currentSources).filter(x=>x.status==='ready'&&!x.stale).length;
  const nav=navigation.find(n=>n.id===view)!;
  const changeView=(key:View)=>{location.hash=key;setView(key);setMetric('');};
  const gscChange=(key:keyof typeof gsc)=>(v:string)=>setGsc(s=>({...s,[key]:v}));
  const gaChange=(key:keyof typeof ga)=>(v:string)=>setGa(s=>({...s,[key]:v}));
  const visibleMetrics=detail?metrics:metrics.slice(0,4);
  return <div className="app-shell">
    <a className="skip" href="#report-main">Skip to report</a>
    <aside className="sidebar">
      <button className="brand" onClick={()=>changeView('overview')}><span className="brand-mark" aria-hidden="true">Z</span><span><strong>ZEE<span className="brand-period">.</span></strong><small>Analytics Studio</small></span></button>
      <nav aria-label="Dashboard sections"><span className="nav-label">Reports</span>{navigation.map((n,i)=><div key={n.id}>{i===4&&<span className="nav-label settings-label">Workspace</span>}<button className={'nav-item '+(view===n.id?'active':'')} aria-current={view===n.id?'page':undefined} onClick={()=>changeView(n.id)}><n.icon size={18}/><span>{n.title}</span>{view===n.id&&<i/>}</button></div>)}</nav>
      <div className="side-footer"><span className="foot-icon"><ShoppingBag size={16}/></span><div><strong>ZEE Footwear</strong><small>Private reporting</small></div></div>
    </aside>
    <main id="report-main" className="main" tabIndex={-1}>
      <header className="topbar"><div><span className="top-brand">ZEE Footwear</span><span className="slash">/</span><span>{nav.title}</span></div>
        <div className="top-actions"><span className="read-only"><Check size={15}/> Read only</span>{reportingView&&<button className="button" disabled={loading} onClick={()=>doRefresh(x=>x+1)}><RefreshCw size={16} className={loading?'spinning':''}/> Refresh</button>}</div>
      </header>
      <div className="workspace">
        <div className="hero"><div><h1>{view==='overview'?'Performance overview':nav.title}</h1><p>{copy[view]}</p></div>
          {dataView&&<div className="hero-actions"><div className="period-box"><CalendarDays size={17}/><span>{range?period(range.from,range.to):'Reporting period'}</span></div>
            <button className="button" disabled={!range||f?.status!=='ready'||loading} onClick={()=>{if(range&&f)exportReport(source,f,range,group);}}><Download size={16}/> Export report</button></div>}
        </div>
        {reportingView&&error&&<div role="alert" className="notice error"><CircleAlert size={17}/>{error}</div>}
        {dataView&&<>
          <div className="toolbar advanced-toolbar">
            <div className="toolbar-cluster">
              <SelectControl name="Report period" value={days} onChange={setDays} options={[...['7','28','56','90'].map(v=>[v,v+' days']),['custom','Custom dates']]}/>
              {days==='custom'&&<form className="range-form" onSubmit={e=>{e.preventDefault();apply(custom);}}>
                <input type="date" aria-label="Start date" required value={custom.from} onChange={e=>setCustom(s=>({...s,from:e.target.value}))}/>
                <input type="date" aria-label="End date" required min={custom.from||undefined} max={packet?.range.stableEnd} value={custom.to} onChange={e=>setCustom(s=>({...s,to:e.target.value}))}/>
                <button className="button tiny">Apply dates</button>
              </form>}
            </div>
            <div className="toolbar-cluster">
              <SelectControl name="Comparison" value={mode} onChange={v=>setMode(v as Mode)} options={[[ 'previous','Previous period'],['year','Previous year'],['custom','Custom comparison'],['off','No comparison']]}/>
              {mode==='custom'&&<form className="range-form" onSubmit={e=>{e.preventDefault();setPriorStart(priorDraft);}}>
                <input type="date" aria-label="Comparison start date" required value={priorDraft} onChange={e=>setPriorDraft(e.target.value)}/>
                <button className="button tiny">Apply comparison</button>
              </form>}
            </div>
          </div>
          {mode==='custom'&&!priorStart&&<p className="method">Choose a comparison start date. Until you apply it, the preceding period remains selected.</p>}
          {days==='custom'&&!applied.from&&<p className="method">Apply start and end dates to replace the default 28-day report.</p>}
          {view==='overview'&&<div className="overview-switch segments" aria-label="Performance source">{(Object.keys(meta) as Source[]).map(k=>{const Icon=meta[k].icon;return <button key={k} className={source===k?'on':''} aria-pressed={source===k} onClick={()=>{choose(k);setMetric('');}}><Icon size={16}/>{meta[k].short}</button>;})}</div>}
          {detail&&source==='gsc'&&<section className="panel report-filters" aria-label="Search Console filters">
            <div className="filter-grid">
              <SelectControl name="Search type" value={gsc.gscType} onChange={gscChange('gscType')} options={choices.gscType}/>
              <SelectControl name="Country" value={gsc.country} onChange={gscChange('country')} options={choices.countries}/>
              <SelectControl name="Device" value={gsc.device} onChange={gscChange('device')} options={choices.devices}/>
              <SelectControl name="Landing URL language" value={gsc.gscLanguage} onChange={gscChange('gscLanguage')} options={choices.gscLanguage}/>
              <SelectControl name="Query segment" value={gsc.gscBrand} onChange={gscChange('gscBrand')} options={choices.gscBrand}/>
            </div>
            <form className="search-filters" onSubmit={e=>{e.preventDefault();setGsc(s=>({...s,queryText:searchDraft.queryText.trim(),pageText:searchDraft.pageText.trim()}));}}>
              <label className="filter-label">Query contains<input maxLength={120} value={searchDraft.queryText} placeholder="e.g. clogs" onChange={e=>draftSearch(s=>({...s,queryText:e.target.value}))}/></label>
              <label className="filter-label">Page URL contains<input maxLength={120} value={searchDraft.pageText} placeholder="e.g. /product-category/" onChange={e=>draftSearch(s=>({...s,pageText:e.target.value}))}/></label>
              <button className="button tiny">Apply text filters</button>
              <button type="button" className="text-button" onClick={()=>{setGsc(defaults);draftSearch({queryText:'',pageText:''});}}>Reset</button>
            </form>
          </section>}
          {detail&&source==='ga'&&<section className="panel report-filters filter-grid" aria-label="GA4 filters">
            <SelectControl name="Acquisition" value={ga.channel} onChange={gaChange('channel')} options={choices.channel}/>
            <SelectControl name="Country" value={ga.gaCountry} onChange={gaChange('gaCountry')} options={choices.gaCountries}/>
            <SelectControl name="Device" value={ga.gaDevice} onChange={gaChange('gaDevice')} options={choices.devices}/>
            <button type="button" className="text-button" onClick={()=>setGa({channel:'all',gaCountry:'all',gaDevice:'all'})}>Reset</button>
          </section>}
          {f&&f.status!=='ready'&&<div role="status" className="notice warning"><CircleAlert size={18}/><div><strong>{meta[source].name} {f.status==='setup'?'needs setup':'could not load'}</strong><p>{f.message} {f.code&&<code>{f.code}</code>}</p></div></div>}
          {f?.stale&&<div className="notice warning"><CircleAlert size={18}/> Live refresh failed. Showing the last successful check for these filters. <code>{f.retryCode}</code></div>}
          {range?.comparisonUnavailable&&<div className="notice warning"><CircleAlert size={18}/> The comparison start falls outside the supported history. Current data is shown on its own.</div>}
          {!!f?.warnings?.length&&<div className="notice warning"><CircleAlert size={18}/><div><strong>Some sections are unavailable</strong><p>{f.warnings.map(w=>w.label+' ('+w.code+')').join(' · ')}</p></div></div>}
          {(f?.thresholded||f?.sampled||f?.otherRow)&&<div className="notice warning"><CircleAlert size={18}/> Google flagged {['thresholding','sampling','an aggregated (other) row'].filter((_,i)=>[f.thresholded,f.sampled,f.otherRow][i]).join(', ')}. Not all detail may be present.</div>}
          {f?.status==='ready'&&range&&<Quality f={f} range={range} comparison={compare}/>}
          <div className="kpis">{visibleMetrics.map(m=><Kpi key={m.id} m={m} f={f} active={currentMetric.id===m.id} onClick={()=>setMetric(m.id)} compare={compare}/>)}</div>
          <div className="split">
            <Timeline f={f} m={currentMetric} range={range} compare={compare} loading={loading}/>
            <section className="panel brief"><span className="brief-icon"><BarChart3 size={19}/></span><h2>{compare?'Period comparison':'Report context'}</h2>
              <p>{range?(compare&&range.priorFrom&&range.priorTo?'Compared with '+period(range.priorFrom,range.priorTo):range.days+' selected calendar days.'):'Available after the source responds.'}</p>
              <dl>{visibleMetrics.slice(0,4).map(m=>{const d=delta(f?.current?.[m.id],f?.prior?.[m.id],m);return <div key={m.id}><dt>{m.label}</dt><dd>{compare?(d?<span className={'change '+d.mood}>{d.text}</span>:'—'):format(f?.current?.[m.id],m,f?.currency)}</dd></div>;})}</dl>
              <footer><Clock3 size={15}/><span>Calendar: {f?.timeZone??(source==='gsc'?'Pacific Time':'source timezone')}</span></footer>
            </section>
          </div>
          {detail&&<Breakdown key={source} source={source} f={f} group={group} setGroup={v=>setGroups(s=>({...s,[source]:v}))} range={range}/>}
          {f?.notes&&<p className="method"><CircleAlert size={16}/>{f.notes}</p>}
          {view==='ga'&&<CommerceSignals query={query} compare={compare} refresh={refresh}/>}
          {view==='ads'&&<AdsFileReport/>}
        </>}
        {(view==='overview'||view==='sources')&&<><div className="section-heading"><div><h2>Data connections</h2><p>Each source is checked independently.</p></div><span className="pill">{loading?'Checking connections…':available+' of 3 connected'}</span></div><SourceCards sources={currentSources} onOpen={changeView}/></>}
        {view==='sources'&&<><Sitemaps key={refresh}/><div className="notice"><CircleAlert size={17}/> Reporting does not change campaigns, budgets, WordPress or Search Console settings. Each source has its own collection and attribution rules.</div></>}
        {view==='journal'&&<Journal/>}
        <footer className="workspace-footer"><span>ZEE Analytics Studio</span><span>Private · Read-only connectors</span></footer>
      </div>
    </main>
  </div>;
}
