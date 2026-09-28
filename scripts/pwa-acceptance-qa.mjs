// Prompt 9 orchestrates existing regression suites instead of duplicating them.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/interaction-hardening/verification';await mkdir(out,{recursive:true});
const gates=[['onboarding','onboarding-qa.mjs'],['today','today-diary-qa.mjs'],['food-search','food-search-qa.mjs'],['scanner','unified-scanner-qa.mjs'],['scanner-live','scanner-live-qa.mjs'],['assistant','assistant-usability-qa.mjs'],['progress','progress-qa.mjs'],['profile','profile-settings-qa.mjs'],['reuse','reuse-qa.mjs'],['navigation','navigation-qa.mjs'],['modern-ux','modern-ux-qa.mjs'],['release','release-qa.mjs'],['offline','offline-qa.mjs']].filter(([name])=>!process.env.P9_GATES||process.env.P9_GATES.split(',').includes(name));
const env={...process.env,PLAYWRIGHT_CHANNEL:process.env.PLAYWRIGHT_CHANNEL||'msedge',INTAKE_PWA_AUDIT:'1',NODE_OPTIONS:`${process.env.NODE_OPTIONS||''} --require ${process.cwd().replaceAll('\\','/')}/scripts/qa-acceptance-preload.cjs`};
delete env.INTAKE_QA_WIDTH;delete env.READINESS_BASELINE;
let next=0;const results=[];
async function worker(){while(next<gates.length){const [name,script]=gates[next++];console.log(`START ${name}`);const start=Date.now();const result=await new Promise(resolve=>{const p=spawn(process.execPath,[`scripts/${script}`],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let log='';p.stdout.on('data',b=>log+=b);p.stderr.on('data',b=>log+=b);p.on('close',code=>resolve({name,script,code,seconds:Math.round((Date.now()-start)/1000),log}));});await writeFile(`${out}/${name}.log`,result.log);results.push({...result,log:undefined});console.log(`${result.code===0?'PASS':'FAIL'} ${name} (${result.seconds}s)`);}}
await Promise.all([worker(),worker()]);await writeFile(`${out}/regression.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(r=>r.code!==0))process.exitCode=1;
