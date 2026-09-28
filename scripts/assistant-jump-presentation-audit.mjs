import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {assistantFixture,pw,out,keyboard,settle,seed,scroll,measure,keyboardMask} from './assistant-jump-harness.mjs';

export const paintAudit=p=>p.evaluate(()=>{
 const props=['position','display','width','height','padding','margin','backgroundColor','backgroundImage','border','boxShadow','backdropFilter','maskImage','overflow','zIndex','pointerEvents','opacity','transform','scale','transition','outline','content'];
 const style=(e,pseudo)=>Object.fromEntries(props.map(k=>[k,getComputedStyle(e,pseudo)[k]]));
 const selectors=['.assistant-shell','.assistant-conversation','.assistant-chat-footer','#assistantContextBar','#assistantForm','#assistantJumpLatest','.assistant-jump-face'];
 return Object.fromEntries(selectors.map(s=>{const e=document.querySelector(s);return[s,{rect:e.getBoundingClientRect().toJSON(),style:style(e),before:style(e,'::before'),after:style(e,'::after')}];}));
});

// This module also exports the audit for the matrix without running a capture.
if(process.argv[1]?.replaceAll('\\','/').endsWith('/assistant-jump-presentation-audit.mjs')){
 const phase=process.env.JUMP_PHASE||'before';await mkdir(out,{recursive:true});
 if(phase==='before')await writeFile(out+'/before-assistant-usability.css',await readFile('public/assistant-usability.css'));
 const results=[];
 for(const engine of ['chromium','webkit']){
  const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
  try{for(const theme of ['light','dark'])for(const open of [false,true]){
   const f=await assistantFixture(b,{engine,theme}),{p,c}=f;
   try{
    await seed(p);await scroll(p,120);await p.locator('#assistantInput').fill('A draft question');
    if(open){await p.locator('#assistantInput').focus();await keyboard(p,430,48,430);await keyboardMask(p);}
    await settle(p);const tag=`${phase}-${engine}-390-${theme}-${open?'keyboard':'closed'}`;
    await p.screenshot({path:`${out}/${tag}.png`});
    results.push({tag,geometry:await measure(p),paint:await paintAudit(p)});
    if(phase==='before'&&engine==='webkit'&&theme==='dark'){
     // Diagnostic only: demonstrate which paint effect creates the broad band.
     await p.addStyleTag({content:'.assistant-conversation { mask-image:none !important; }'});
     await p.screenshot({path:`${out}/${tag}-mask-disabled-probe.png`});
    }
    console.log('CAPTURE',tag);
   }finally{await c.close();}
  }}finally{await b.close();}
 }
 await writeFile(`${out}/${phase}-audit.json`,JSON.stringify(results,null,2));
}
