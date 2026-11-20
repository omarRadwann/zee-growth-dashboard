const formulaPrefix = /^[\s\uFEFF]*[=+\-@]/u;

export function csvText(rows) {
  return '\uFEFF' + rows.map(row=>row.map(value=>{
    const text=String(value??'');
    const safer=typeof value==='string'&&(formulaPrefix.test(text)||/^[\r\n\t]/.test(text))?"'"+text:text;
    return '"'+safer.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n');
}

function parseRows(text) {
  const input=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){
      if(ch==='"'){
        if(input[i+1]==='"'){cell+='"';i++;}
        else {quoted=false;closed=true;}
      }else cell+=ch;
    }else if(ch===','||ch==='\n'||ch==='\r'){
      row.push(cell);cell='';closed=false;
      if(ch!==','){
        if(ch==='\r'&&input[i+1]==='\n')i++;
        if(row.some(s=>s.trim()))rows.push(row);
        row=[];
        if(rows.length>30010)throw Error('This file has too many rows. Export a smaller date range.');
      }
    }else if(ch==='"'&&!closed&&!cell){quoted=true;}
    else if(closed||ch==='"'){throw Error('The CSV has a malformed quoted field. Export it again as CSV.');}
    else cell+=ch;
  }
  if(quoted)throw Error('The CSV ends inside a quoted field.');
  row.push(cell);if(row.some(s=>s.trim()))rows.push(row);
  return rows;
}
const canonical = s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={
  date:['date','day'],campaign:['campaign','campaignname'],id:['campaignid'],
  impressions:['impressions','impr'],clicks:['clicks'],cost:['cost','spend'],
  conversions:['conversions'],conversionValue:['conversionvalue','convvalue','conversionsvalue'],
  currency:['currency','currencycode'],
};
const required=['date','campaign','impressions','clicks','cost','conversions','conversionValue','currency'];
const fields=['impressions','clicks','cost','conversions','conversionValue'];
const isDate = s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function numeric(value,integer) {
  const s=value?.trim()??'';
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;
  const n=Number(s.replaceAll(',',''));
  return Number.isFinite(n)&&n<=1e12&&(!integer||Number.isSafeInteger(n))?n:null;
}
export function parseAdsFile(text) {
  if(typeof text!=='string'||text.length>5_000_000)throw Error('Choose a UTF-8 CSV under 5 MB.');
  const data=parseRows(text);
  let map={};
  const header=data.slice(0,8).findIndex(row=>{
    const h=row.map(canonical);
    map=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,h.findIndex(v=>names.includes(v))]));
    return required.every(k=>map[k]>=0);
  });
  if(header<0)throw Error('Include Day, Campaign, Impressions, Clicks, Cost, Conversions, Conversion value and Currency. Download the template for the exact columns.');
  const head=data[header].map(canonical);
  if(Object.entries(aliases).some(([,names])=>head.filter(x=>names.includes(x)).length>1))throw Error('Each report field must have only one column.');
  const records=[];const keys=new Set(),currencies=new Set();
  for(const [i,r] of data.slice(header+1).entries()){
    if(/^(total:|total\s*[-–])/i.test(r[map.campaign]?.trim()??'')||/^total:/i.test(r[0]?.trim()??''))continue;
    const line=i+header+2;
    const date=r[map.date]?.trim()??'';
    const campaign=r[map.campaign]?.trim()??'';
    const campaignId=r[map.id]?.trim()||campaign;
    const currency=r[map.currency]?.trim().toUpperCase()??'';
    if(!isDate(date)||!campaign||campaign.length>300||!campaignId||campaignId.length>300||!/^[A-Z]{3}$/.test(currency))throw Error('Invalid date, campaign or ISO currency in data record '+line+'. Use YYYY-MM-DD.');
    const key=JSON.stringify([date,campaignId]);
    if(keys.has(key))throw Error('Duplicate campaign/day in record '+line+'. Use a Day by Campaign export with no extra segments; include Campaign ID for campaigns that share a name.');
    keys.add(key);currencies.add(currency);
    const values=Object.fromEntries(fields.map(v=>[v,numeric(r[map[v]],v==='impressions'||v==='clicks')]));
    if(Object.values(values).some(n=>n===null))throw Error('Invalid or missing numeric values in record '+line+'. Use English numeric formatting and explicit zeros.');
    records.push({date,campaign,campaignId,...values});
  }
  if(!records.length)throw Error('No campaign-day rows were found.');
  if(currencies.size!==1)throw Error('Mixed currencies cannot be added together. Export one account and currency at a time.');
  records.sort((a,b)=>a.date.localeCompare(b.date));
  return {currency:[...currencies][0],records,from:records[0].date,to:records.at(-1).date};
}
const add = (a,row)=>{for(const k of fields)a[k]=(a[k]??0)+row[k];return a;};
export function selectAdsRows(data,from,to){
  const rows=data.records.filter(r=>r.date>=from&&r.date<=to);
  const groups=new Map(),days=new Map();
  for(const row of rows){
    if(!groups.has(row.campaignId))groups.set(row.campaignId,{label:row.campaign,id:row.campaignId});
    if(!days.has(row.date))days.set(row.date,{label:row.date});
    add(groups.get(row.campaignId),row);add(days.get(row.date),row);
  }
  return {rowCount:rows.length,totals:rows.reduce(add,{}),campaigns:[...groups.values()].sort((a,b)=>b.cost-a.cost),daily:[...days.values()]};
}
