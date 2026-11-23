import {readFileSync} from 'node:fs';
const {name,version}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
console.log(`${name}-${version}.tgz`);
