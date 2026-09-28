import {spawn} from 'node:child_process';
import {mkdir,writeFile,open,readFile} from 'node:fs/promises';
import path from 'node:path';
const out='artifacts/final-mobile-integration';await mkdir(out+'/gates',{recursive:true});
const jobs=[
 ['unit',null,{}],
 ['today','today-diary-qa.mjs',{}],
 ['add','add-flow-qa.mjs',{}],
 ['review','review-meal-static-rows-qa.mjs',{MEAL_QUICK:'1'}],
 ['scanner-edge','scanner-edge-qa.mjs',{SCANNER_EDGE_QUICK:'1'}],
 ['scanner-safety','scanner-edge-safety.mjs',{}],
 ['edge-back','edge-row-qa.mjs',{EDGE_PHASE:'interactions'}],
 ['viewer','photo-dismiss-qa.mjs',{PHOTO_QUICK:'1'}],
 ['viewer-lifecycle','photo-dismiss-lifecycle-qa.mjs',{}],
 ['media','plate-photo-integrity-qa.mjs',{}],
 ['weight-keyboard','weight-sheet-keyboard-qa.mjs',{WEIGHT_KEYBOARD_QUICK:'1'}],
 ['weight','weight-flow-qa.mjs',{WEIGHT_QUICK:'1'}],
 ['progress','progress-qa.mjs',{}],
 ['assistant-scroll','assistant-scroll-qa.mjs',{CHAT_SMOKE:'1'}],
 ['assistant-shell','assistant-shell-qa.mjs',{ASSISTANT_SMOKE:'1'}],
 ['profile','profile-sheet-final-qa.mjs',{PROFILE_QUICK:'1'}],
 ['sheets','sheet-system-qa.mjs',{SHEET_QUICK:'1'}],
 ['keyboard','keyboard-acceptance-qa.mjs',{}],
 ['form-focus','form-focus-integration-qa.mjs',{}],
 ['navigation','navigation-qa.mjs',{}],
 ['offline','offline-qa.mjs',{}],
 ['release','release-qa.mjs',{}],
 ['modern-ux','modern-ux-qa.mjs',{}],
 ['touch-state','touch-hover-qa.mjs',{HOVER_QUICK:'1'}],
 ['disclosure','disclosure-focus-qa.mjs',{DISCLOSURE_QUICK:'1'}],
 ['today-atomic','today-atomic-matrix.mjs',{ATOMIC_SMOKE:'1'}],
 ['unified-scanner','unified-scanner-qa.mjs',{}],
 ['package-scan','package-scan-qa.mjs',{}],
 ['gallery-functional','gallery-functional-qa.mjs',{}],
];
const selected=process.env.INTEGRATION_GATES?.split(','),results=[];let index=0;
async function worker(){while(index<jobs.length){const[name,script,extra]=jobs[index++];if(selected&&!selected.includes(name))continue;
 const log=await open(out+'/gates/'+name+'.log','w'),start=Date.now();console.log('START',name);
 const env={...process.env,PLAYWRIGHT_MODULE:process.env.PLAYWRIGHT_MODULE||'playwright',PLAYWRIGHT_CHANNEL:process.env.PLAYWRIGHT_CHANNEL||'msedge',INTAKE_URL:process.env.INTAKE_URL||'http://127.0.0.1:3002',INTAKE_PWA_AUDIT:'1',INTAKE_QA_OUTPUT:out+'/gates/'+name,INTAKE_MEAL_QA_OUTPUT:out+'/gates/'+name,...extra};
 const args=script?['--require',path.resolve('scripts/final-integration-preload.cjs'),'scripts/'+script]:['--test'];
 const child=spawn(process.execPath,args,{env,stdio:['ignore',log.fd,log.fd],windowsHide:true});
 const timer=setTimeout(()=>child.kill(),12*60*1000);
 const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timer);await log.close();
 results.push({name,script:script||'npm test (node --test)',env:extra,code,seconds:Math.round((Date.now()-start)/1000)});
 const priorReruns=selected?JSON.parse(await readFile(out+'/gates-rerun.json','utf8').catch(()=>'[]')):[];
 await writeFile(out+(selected?'/gates-rerun.json':'/gates.json'),JSON.stringify([...priorReruns.filter(r=>!results.some(n=>n.name===r.name)),...results],null,2));console.log(code===0?'PASS':'FAIL',name,results.at(-1).seconds+'s');
}}
await Promise.all([worker(),worker()]);console.log('COMPLETE',results.filter(r=>r.code===0).length+'/'+results.length);if(results.some(r=>r.code!==0))process.exitCode=1;
