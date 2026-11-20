import { readConfig } from './config.mjs';
import { createHttp } from './http.mjs';

try {
  const reporter=createHttp(readConfig(),{local:true});
  const from=process.argv[2];const to=process.argv[3];
  for(const source of ['gsc','ga','ads']){
    const p=new URLSearchParams({source,days:'7'});
    if(from&&to){p.set('from',from);p.set('to',to);}
    const check=await reporter(new Request(`http://127.0.0.1/api/reports?${p}`));
    const result=await check.json();
    const feed=result.sources?.[source]??result;
    console.log(JSON.stringify({source,status:feed.status,code:feed.code,dailyRows:feed.daily?.length,breakdownRows:feed.rows?.length,currency:feed.currency,timeZone:feed.timeZone}));
  }
} catch(e) {
  console.error(e.code??'PROBE_FAILED');
  process.exitCode=1;
}
