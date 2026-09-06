import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import PhpParser from 'php-parser';
import { validateData } from '../lib/metrics.mjs';
const script=fs.readFileSync(new URL('../connectors/google-ads-report.js',import.meta.url),'utf8');
const php=fs.readFileSync(new URL('../connectors/wordpress/zee-growth-bridge/zee-growth-bridge.php',import.meta.url),'utf8');
const iterator=rows=>{let i=0;return {hasNext:()=>i<rows.length,next:()=>rows[i++]};};
function execute({preview=false,wrongAccount=false,primary=true,deliveryStatus=200}={}) {
  let sent=null; const queries=[];
  const now=new Date().toISOString().slice(0,10);
  const sandbox={Map,Set,Date,JSON,Number,String,Array,Error,Math,Logger:{log:()=>{}},
    Utilities:{Charset:{UTF_8:'utf-8'},formatDate:()=>now,computeHmacSha256Signature:(body,key)=>[...crypto.createHmac('sha256',key).update(body).digest()].map(n=>n>127?n-256:n)},
    UrlFetchApp:{fetch:(url,options)=>{sent={url,...options};return {getResponseCode:()=>deliveryStatus,getContentText:()=>'{"ok":true}'};}},
    AdsApp:{currentAccount:()=>({getCustomerId:()=>wrongAccount?'wrong':'206-762-3227',getCurrencyCode:()=>'EGP',getTimeZone:()=>'Africa/Cairo'}),getExecutionInfo:()=>({isPreview:()=>preview}),search:q=>{queries.push(q); if(q.includes('FROM conversion_action'))return iterator([{conversionAction:{id:'123',category:'PURCHASE',primaryForGoal:primary}}]); if(q.includes('segments.conversion_action IN'))return iterator([{campaign:{id:'1',name:'Test campaign'},segments:{date:now},metrics:{conversions:2.5,conversionsValue:2500}}]); return iterator([{campaign:{id:'1',name:'Test campaign'},segments:{date:now},metrics:{costMicros:100000000,clicks:50,impressions:1000,conversions:4.5}}]);}}};
  vm.createContext(sandbox);
  vm.runInContext(script.replace("secret: 'REPLACE_INSIDE_GOOGLE_ADS_ONLY'","secret: '"+'a'.repeat(64)+"'").replace('purchaseActionIds: []','purchaseActionIds: [123]')+'\nmain();',sandbox,{timeout:2000});
  return {sent,queries};
}
test('WordPress connector parses under PHP 8 syntax',()=>{const parser=new PhpParser({parser:{phpVersion:'8.1',suppressErrors:false}});assert.ok(parser.parseCode(php).children.length);});
test('Ads script constructs valid purchase-only snapshot and signed delivery',()=>{const {sent,queries}=execute();const raw=JSON.parse(sent.payload);const data=validateData(raw);assert.equal(data.ads[0].cost,100);assert.equal(data.ads[0].purchases,2.5);assert.equal(data.ads[0].purchaseValue,2500);assert.equal(data.ads[0].conversions,4.5);const expected=crypto.createHmac('sha256','a'.repeat(64)).update(sent.headers['X-Zee-Timestamp']+'.'+sent.payload).digest('hex');assert.equal(sent.headers['X-Zee-Signature'],expected);assert.equal(sent.followRedirects,false);assert.ok(queries.some(q=>q.includes('conversionActions/123')));});
test('Ads preview does not transmit data',()=>assert.equal(execute({preview:true}).sent,null));
test('wrong Ads account and non-primary purchases cannot export',()=>{assert.throws(()=>execute({wrongAccount:true}),/Wrong account/);assert.throws(()=>execute({primary:false}),/primary PURCHASE/);});
test('failed delivery is not reported as successful',()=>assert.throws(()=>execute({deliveryStatus:403}),/delivery failed/));
test('Ads script contains no campaign-changing operations',()=>{assert.doesNotMatch(script,/\.(setBudget|setAmount|setCpc|pause|enable|remove|newCampaignBuilder|mutate|mutateAll)\s*\(/);});
test('WordPress private reader requires capability, nonce and no-store',()=>{assert.match(php,/current_user_can\(self::CAP\)/);assert.match(php,/check_ajax_referer\('zee-growth-read'\)/);assert.match(php,/Cache-Control: private, no-store/);assert.doesNotMatch(php,/wp_ajax_nopriv_zee_growth_snapshot/);});
test('WordPress import validates HMAC, time window and account',()=>{assert.match(php,/hash_equals\(\$expected/);assert.match(php,/abs\(time\(\) - \(int\) \$timestamp\) > 300/);assert.match(php,/Wrong Ads account/);assert.match(php,/older report cannot overwrite/);});
test('Woo orders are read via Woo APIs and never written',()=>{assert.match(php,/wc_get_orders/);assert.doesNotMatch(php,/\$order->(save|delete|update_status|set_)|UPDATE.+wc_orders|DELETE.+wc_orders/i);});
test('Woo collection is bounded, resumable, date reconciled and event invalidated',()=>{
  assert.match(php,/const BATCH_SIZE = 100/);
  assert.match(php,/update_option\('zee_growth_woo_job'/);
  assert.match(php,/\$state\['row'\]\['orders'\] !== \$state\['expected'\]/);
  assert.match(php,/\$key !== \$state\['date'\]/);
  assert.match(php,/woocommerce_before_delete_order/);
  assert.match(php,/get_option\('zee_growth_dirty_'/);
  assert.doesNotMatch(php,/MAX_ORDERS|for \(\$page = 1/);
});
