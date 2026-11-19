import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const config=readFileSync(process.argv[2],'utf8');
assert.match(config,/dsh-feishu-subscription/);
assert.match(config,/feishu-subscription/);
console.log('Packed plugin is composed into the official DSH Web profile.');
