export type CsvCell = string|number|null|undefined;
export type AdsRecord = {date:string;campaign:string;campaignId:string;impressions:number;clicks:number;cost:number;conversions:number;conversionValue:number};
export type AdsImport = {currency:string;from:string;to:string;records:AdsRecord[]};
export type AdsSummary = {label:string;id?:string;impressions:number;clicks:number;cost:number;conversions:number;conversionValue:number};
export function csvText(rows:CsvCell[][]):string;
export function parseAdsFile(text:string):AdsImport;
export function selectAdsRows(data:AdsImport,from:string,to:string):{rowCount:number;totals:Partial<Omit<AdsSummary,'label'|'id'>>;campaigns:AdsSummary[];daily:AdsSummary[]};
