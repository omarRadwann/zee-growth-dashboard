import { useEffect, useMemo, useState } from 'react';
import { Activity, CircleAlert, Download, RefreshCw, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { csvText, parseAdsFile, selectAdsRows, type AdsImport, type CsvCell } from './report-data.mjs';

export function saveCsv(filename:string, rows:CsvCell[][]) {
  const url=URL.createObjectURL(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');
  a.href=url;a.download=filename;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1_000);
}
const count = new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const value = (n:number|null|undefined)=>n==null?'—':count.format(n);
const labels:Record<string,string>={view_item:'Item view',add_to_cart:'Add to cart',begin_checkout:'Begin checkout',purchase:'Purchase'};
type MetricResult = {
  status:string;checkedAt?:string;message?:string;stale?:boolean;thresholded?:boolean;
  warnings?:{label:string;code:string}[];activeUsers?:number|null;rows?:{label:string;current:number|null;prior:number|null}[];
};
async function getReport(url:string,signal:AbortSignal) {
  const response=await fetch(url,{signal,cache:'no-store'});
  const body=await response.json();
  if(!response.ok)throw Error(body.message??'The private reporting server did not return a report.');
  return body as MetricResult;
}

export function CommerceSignals({query,compare,refresh}:{query:string;compare:boolean;refresh:number}) {
  const [result,setResult]=useState<{key:string;body:MetricResult}>();
  const [enabled,setEnabled]=useState(false);
  const [live,setLive]=useState<MetricResult>();
  const [liveCheck,checkLive]=useState(0);
  const key=query+'|'+refresh;
  useEffect(()=>{
    if(!enabled)return;
    const a=new AbortController();
    getReport('/api/ga-events?'+query+(refresh?'&refresh=1':''),a.signal)
      .then(body=>{if(!a.signal.aborted)setResult({key,body});})
      .catch(e=>{if(!a.signal.aborted)setResult({key,body:{status:'error',message:e.message}});});
    return()=>a.abort();
  },[enabled,query,key,refresh]);
  useEffect(()=>{
    if (!liveCheck) return;
    const a=new AbortController();
    getReport('/api/ga-realtime?refresh=1',a.signal).then(body=>{if(!a.signal.aborted)setLive(body);})
      .catch(e=>{if(!a.signal.aborted)setLive({status:'error',message:e.message});});
    return()=>a.abort();
  },[liveCheck]);
  const shown=result?.key===key?result.body:undefined;
  const highest=Math.max(1,...shown?.rows?.map(x=>Math.max(x.current??0,compare?(x.prior??0):0))??[]);
  return <div className="split analytics-extras">
    <section className="panel signal-panel">
      <header className="panel-head"><div><h2>Shopping events</h2><p>Count events in the selected dates and GA4 filters.</p></div>
        {!enabled&&<button className="button tiny" onClick={()=>setEnabled(true)}>Load events</button>}
        {shown?.rows?.length&&<button className="button tiny" onClick={()=>saveCsv('zee-ga4-shopping-events.csv',[
          ['Applied report parameters',query],['Data checked at',shown.checkedAt],
          ['Event', 'Current events', ...(compare?['Comparison events']:[])],
          ...shown.rows!.map(r=>[r.label,r.current,...(compare?[r.prior]:[])]),
        ])}><Download size={15}/> Export</button>}
      </header>
      {shown?.rows?.length?<div className="event-rows">{shown.rows.map(row=><div key={row.label}>
        <div className="event-label"><span>{labels[row.label]??row.label}</span><strong>{value(row.current)}{compare&&<small> vs {value(row.prior)}</small>}</strong></div>
        <meter className="event-meter" min={0} max={highest} value={row.current??0} aria-label={`${labels[row.label]??row.label}: ${row.current??'unavailable'}`}/>
      </div>)}</div>:<p role="status" className="inline-note">{shown?.message??(enabled?'Requesting event counts…':'Load item views, cart adds, checkouts and purchases.')}</p>}
      <p className="inline-note">{shown?.stale?'Last successful event results are shown. ':''}{shown?.warnings?.length?'Some comparison events were unavailable. ':''}{shown?.thresholded?'Google has applied data thresholding. ':''}These are event counts, not a sequential user funnel. A dash means Google returned no row.</p>
    </section>
    <section className="panel brief live-panel"><span className="brief-icon"><Activity size={19}/></span><h2>Active users now</h2><p>GA4 property-wide, last 30 minutes. Independent of report filters.</p>
      <strong className="live-count" aria-live="polite">{value(live?.activeUsers)}</strong>
      <p role="status">{live?.message??(live?.stale?'Cached result. Retry to get a fresh count.':live?.checkedAt?'Checked '+new Date(live.checkedAt).toLocaleTimeString('en-GB',{timeZone:'Africa/Cairo'})+' Cairo':liveCheck?'Checking Google…':'Check on demand.')}</p>
      <button className="button tiny" onClick={()=>checkLive(i=>i+1)}><RefreshCw size={14}/> Check now</button>
    </section>
  </div>;
}

export function AdsFileReport() {
  const [file,setFile]=useState<{name:string;data:AdsImport}>();
  const [error,setError]=useState('');
  const [dates,setDates]=useState({from:'',to:''});
  const [tab,setTab]=useState<'campaign'|'day'>('campaign');
  const [page,setPage]=useState(0);
  const selection=useMemo(()=>file&&dates.from&&dates.to&&dates.from<=dates.to?selectAdsRows(file.data,dates.from,dates.to):undefined,[file,dates]);
  const display=tab==='campaign'?selection?.campaigns:selection?.daily;
  const fields=[['impressions','Impressions'],['clicks','Clicks'],['cost','Spend'],['conversions','Conversions'],['conversionValue','Conversion value']] as const;
  return <section className="panel ads-import">
    <header className="panel-head"><div><h2>Ads CSV workspace</h2><p>Analyze a real Google Ads export while live API access is unavailable. Files stay in this tab.</p></div><button className="button tiny" onClick={()=>saveCsv('zee-ads-import-template.csv',[
      ['Day','Campaign','Campaign ID','Impressions','Clicks','Cost','Conversions','Conversion value','Currency'],
    ])}><Download size={15}/> Template</button></header>
    <div className="import-options"><label className="upload-label"><Upload size={17}/><span>Choose a campaign-by-day CSV</span><input type="file" aria-label="Ads CSV file" accept=".csv,text/csv" onChange={async e=>{
      const input=e.currentTarget;const picked=input.files?.[0];input.value='';
      if(!picked)return;
      setError('');
      try{
        if(picked.size>5_000_000)throw Error('Choose a UTF-8 CSV under 5 MB.');
        const data=parseAdsFile(await picked.text());setFile({name:picked.name,data});setDates({from:data.from,to:data.to});setPage(0);
      }catch(err){setFile(undefined);setError(err instanceof Error?err.message:'The file could not be read.');}
    }}/></label><p>Use ISO dates (YYYY-MM-DD), one currency, and no device or network segments. Add the currency column if it is missing from the Google export.</p></div>
    {error&&<p role="alert" className="notice error inline-note"><CircleAlert size={16}/>{error}</p>}
    {file&&<div className="import-results">
      <div className="section-heading"><div><h3>{file.name}</h3><p>{file.data.currency} · {file.data.records.length.toLocaleString()} original campaign-day rows</p></div><span className="pill">Local file only</span></div>
      <div className="toolbar"><div className="toolbar-cluster"><label>Start<input aria-label="Imported report start" type="date" min={file.data.from} max={dates.to||file.data.to} value={dates.from} onChange={e=>{setDates(s=>({...s,from:e.target.value}));setPage(0);}}/></label><label>End<input aria-label="Imported report end" type="date" min={dates.from||file.data.from} max={file.data.to} value={dates.to} onChange={e=>{setDates(s=>({...s,to:e.target.value}));setPage(0);}}/></label></div>
        <button className="button tiny" onClick={()=>{setFile(undefined);setError('');}}>Unload file</button></div>
      <div className="kpis import-kpis">{[['cost','Recorded spend'],['clicks','Recorded clicks'],['conversions','Recorded conversions']].map(([k,label])=><div className="kpi" key={k}><span>{label}</span><strong>{k==='cost'?file.data.currency+' ':''}{value(selection?.totals?.[k as 'cost'|'clicks'|'conversions'])}</strong></div>)}</div>
      {selection?.daily.length?<div className="chart import-chart" role="img" aria-label="Recorded spend by day for rows in the local Ads file"><ResponsiveContainer width="100%" height="100%"><BarChart data={selection.daily} margin={{top:8,right:12,left:0,bottom:7}}><CartesianGrid vertical={false} stroke="#e6ebe4"/><XAxis dataKey="label" minTickGap={35} tick={{fontSize:12}} tickFormatter={v=>String(v).slice(5)}/><YAxis width={58} tick={{fontSize:12}}/><Tooltip formatter={v=>[file.data.currency+' '+value(Number(v)), 'Recorded spend']}/><Bar dataKey="cost" fill="#487c51" radius={[4,4,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>:<p role="status" className="inline-note">No imported rows match this date range.</p>}
      <div className="toolbar"><div className="segments"><button className={tab==='campaign'?'on':''} aria-pressed={tab==='campaign'} onClick={()=>{setTab('campaign');setPage(0);}}>Campaign totals</button><button className={tab==='day'?'on':''} aria-pressed={tab==='day'} onClick={()=>{setTab('day');setPage(0);}}>Daily rows</button></div><button className="button tiny" disabled={!display?.length} onClick={()=>saveCsv('zee-ads-local-'+tab+'.csv',[
        ['Source','Local Ads CSV'],['File',file.name],['Currency',file.data.currency],['Start date',dates.from],['End date',dates.to],['Included campaign-day rows',selection?.rowCount],['Scope','Imported rows only; coverage not assumed'],
        [tab==='campaign'?'Campaign':'Day',...fields.map(f=>f[1])],...(display??[]).map(row=>[row.label,...fields.map(([id])=>row[id])]),
      ])}><Download size={15}/> Export selection</button></div>
      {!!display?.length&&<div className="scroll-table"><table><thead><tr><th>{tab==='campaign'?'Campaign':'Day'}</th>{fields.map(([id,label])=><th key={id}>{label}</th>)}</tr></thead><tbody>{display.slice(page*10,page*10+10).map(row=><tr key={row.id??row.label}><td>{row.label}</td>{fields.map(([id])=><td key={id}>{value(row[id])}</td>)}</tr>)}</tbody></table></div>}
      {!!display?.length&&<div className="pager"><span>{page*10+1}–{Math.min(display.length,(page+1)*10)} of {display.length}</span><button className="button tiny" disabled={page===0} onClick={()=>setPage(i=>i-1)}>Previous</button><button className="button tiny" disabled={(page+1)*10>=display.length} onClick={()=>setPage(i=>i+1)}>Next</button></div>}
      <p className="inline-note">Totals use imported rows only. Missing days are not zero-filled. The file is not synced, attributed to purchases, or combined with API totals.</p>
    </div>}
  </section>;
}
