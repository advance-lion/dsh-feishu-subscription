import {createRequire} from 'node:module';

// Playwright's ESM facade imports a CommonJS in-process singleton. Keep that
// singleton outside the replaceable plugin module graph, and use Node's native
// CommonJS entry instead of re-evaluating the ESM facade on each hot upgrade.
const nativeRequire=createRequire(import.meta.url);
const key=Symbol.for('dsh-feishu-subscription.playwright-runtime.v1');
export function getPlaywright(){
 const entry=nativeRequire.resolve('playwright-core');
 const runtimes=globalThis[key]??=new Map();
 if(runtimes.has(entry))return runtimes.get(entry);
 const runtime=nativeRequire('playwright-core');
 if(typeof runtime?.request?.newContext!=='function'||typeof runtime?.chromium?.launch!=='function')throw Error('PLAYWRIGHT_RUNTIME_UNAVAILABLE');
 runtimes.set(entry,runtime);return runtime;
}
