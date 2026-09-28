import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/app-start.js',import.meta.url),'utf8');
function fixture(){
 const surfaces=Array.from({length:2},()=>({inert:true,attributes:new Set(['data-startup-surface','aria-busy']),removeAttribute(k){this.attributes.delete(k);}}));
 const text={textContent:'Opening Intake…'},button={hidden:true,addEventListener(type,fn){this.click=fn;}};const status={removed:false,role:'status',querySelector:s=>s==='span'?text:button,remove(){this.removed=true;},setAttribute(k,v){this[k]=v;}};
 const body={loading:true,removeAttribute(){this.loading=false;}},c={window:{},document:{body,documentElement:{removeAttribute(){}},querySelector:()=>status,querySelectorAll:()=>surfaces},location:{reload(){c.reloads++;}},reloads:0};
 // Isolate the state transitions; network/module timing is tested by real-browser QA.
 vm.runInNewContext(source.replace(/  import\('\.\/app-router\.js\?v=\d+'\)\.catch\(\(\) => window\.IntakeStartup\.fail\(\)\);/,'  window.loadRequested = true;'),c);
 return {c,surfaces,text,button,status,body};
}
for(const file of ['index','profile','assistant','progress'])test(`${file} ships inert primary surfaces before any JS/module execution`,()=>{
 const html=readFileSync(new URL(`../public/${file}.html`,import.meta.url),'utf8');
 assert.match(html,/<body[^>]*data-app-loading/);assert.match(html,/<main[^>]*inert[^>]*data-startup-surface[^>]*aria-busy="true"/);assert.match(html,/<nav class="mobile-tabbar[^>]*inert[^>]*data-startup-surface/);assert.match(html,/id="appStartupStatus" role="status"/);assert.match(html,/<script src="app-start.js\?v=\d+"><\/script>/);
});
test('successful mount releases readiness and removes its status without replaying an action',()=>{const f=fixture();f.c.window.IntakeStartup.complete();assert.equal(f.body.loading,false);assert.equal(f.status.removed,true);for(const s of f.surfaces){assert.equal(s.inert,false);assert.equal(s.attributes.size,0);}assert.equal(f.c.reloads,0);});
test('failed startup keeps controls inert and offers only explicit Reload',()=>{const f=fixture();f.surfaces[0].inert=false;f.c.window.IntakeStartup.fail();assert.ok(f.surfaces.every(s=>s.inert));assert.equal(f.button.hidden,false);assert.match(f.text.textContent,/couldn't open/);assert.equal(f.status.role,'alert');assert.equal(f.c.reloads,0);f.button.click();assert.equal(f.c.reloads,1);});
test('router removes bootstrap-only markup from cached route templates',()=>{
 const router=readFileSync(new URL('../public/app-router.js',import.meta.url),'utf8');const fn=router.slice(router.indexOf('function templateFrom'),router.indexOf('\ntemplates.set'));
 for(const key of ['data-app-loading','data-startup-surface','inert','aria-busy'])assert.ok(fn.includes(`removeAttribute("${key}")`));assert.ok(fn.includes('body.querySelector("#appStartupStatus")?.remove()'));
});
