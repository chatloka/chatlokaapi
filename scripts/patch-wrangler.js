import { readFileSync, writeFileSync } from 'fs';

const path = 'dist/chatlokaapi/wrangler.json';
const config = JSON.parse(readFileSync(path, 'utf8'));

config.assets = config.assets || {};
config.assets.run_worker_first = ['/api/*', '/manage/api/*', '/downloads/*'];

writeFileSync(path, JSON.stringify(config, null, 2));
console.log('Patched wrangler.json with run_worker_first');
