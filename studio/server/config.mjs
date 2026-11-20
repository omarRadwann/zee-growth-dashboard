import { readFileSync } from 'node:fs';
import { GoogleError } from './google.mjs';

export function readConfig(env = process.env) {
  const { GOOGLE_APPLICATION_CREDENTIALS: file, GOOGLE_SERVICE_ACCOUNT_JSON: json, ...rest } = env;
  let key = json;
  if (!key && file) {
    try { key = readFileSync(file,'utf8'); }
    catch { throw new GoogleError('CREDENTIAL_FILE_UNREADABLE',503); }
  }
  return { ...rest, GOOGLE_SERVICE_ACCOUNT_JSON:key };
}
