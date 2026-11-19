import path from 'node:path';
import {homedir} from 'node:os';
export function dataDirectory({platform=process.platform,env=process.env,home=homedir()}={}){
 if(platform==='win32')return path.join(env.LOCALAPPDATA||path.join(home,'AppData','Local'),'dsh-feishu-subscription');
 if(platform==='darwin')return path.join(home,'Library','Application Support','dsh-feishu-subscription');
 return path.join(env.XDG_DATA_HOME||path.join(home,'.local','share'),'dsh-feishu-subscription');
}
