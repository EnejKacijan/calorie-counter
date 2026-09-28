import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {scannerTraceEnabled} from '../public/package-scan.js';
import {animateAddMode} from '../public/add-surface.js';
const source=readFileSync(new URL('../public/package-scan.js',import.meta.url),'utf8');
function cancelHarness() {
 const listeners={},closed=[];
 const dialog={addEventListener:(type,fn)=>listeners[type]=fn};
 const start=source.indexOf('dialog.addEventListener("cancel", event =>');
 vm.runInNewContext(source.slice(start,source.indexOf('find(".package-scan-close").onclick',start)),{dialog,sourceBack:reason=>closed.push({reason})});
 return {dialog,listeners,closed};
}
test('bubbling file-input cancel never dismisses the scanner or prevents the input event',()=>{
 const f=cancelHarness();let prevented=false;
 f.listeners.cancel({target:{type:'file'},preventDefault(){prevented=true;}});
 assert.equal(prevented,false);assert.equal(f.closed.length,0);
});
test('the dialog own cancel still intentionally closes exactly once',()=>{
 const f=cancelHarness();let prevented=false;
 f.listeners.cancel({target:f.dialog,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(f.closed.length,1);assert.equal(f.closed[0].reason,'dialog-cancel');
});
test('scanner trace requires explicit opt-in AND a development local/private host',()=>{
 for(const hostname of ['localhost','127.0.0.1','10.34.34.59','192.168.1.2','172.16.1.2','[::1]']){
  assert.equal(scannerTraceEnabled({hostname,search:'?scannerTrace=1'}),true);
  assert.equal(scannerTraceEnabled({hostname,search:''}),false);
 }
 for(const hostname of ['intake.example','localhost.evil.test','172.15.1.2','8.8.8.8'])assert.equal(scannerTraceEnabled({hostname,search:'?scannerTrace=1'}),false);
});
test('scanner reuses Add mode animation for all three positions with no completion-state callback',()=>{
 assert.match(source,/animations = animateAddMode\(find\("\.scanner-mode-indicator"\), find\("\.scanner-hint"\)/);
 const calls=[],indicator={style:{},animate:(frames,timing)=>{calls.push({frames,timing});return{};}},content={animate:()=>({})};
 animateAddMode(indicator,content,0,2,{matchMedia:()=>({matches:false})});
 assert.equal(indicator.style.transform,'translateX(200%)');assert.equal(calls[0].timing.duration,160);assert.equal(calls[0].timing.easing,'cubic-bezier(.2,.7,.2,1)');
});
