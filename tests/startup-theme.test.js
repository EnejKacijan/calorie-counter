import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/startup-theme.js',import.meta.url),'utf8');
for(const [name,state,dark,expected]of [
 ['fresh dark',null,true,'#1b1a16'],['fresh light',null,false,'#fbfaf6'],
 ['saved light over dark OS',{theme:'light'},true,'#fbfaf6'],
 ['saved dark over light OS',{theme:'dark'},false,'#1b1a16'],
 ['system preference follows OS',{theme:'light',user:{themePreference:'system'}},true,'#1b1a16'],
 ['explicit preference wins',{theme:'light',user:{themePreference:'dark'}},false,'#1b1a16'],
])test('pre-paint appearance: '+name,()=>{
 const style={setProperty(k,v){this[k]=v;}},meta={setAttribute(k,v){this[k]=v;}};
 vm.runInNewContext(source,{localStorage:{getItem:key=>key==='calorie-counter-state'?JSON.stringify(state):null,setItem(){assert.fail('startup must not write data');}},matchMedia:()=>({matches:dark}),document:{documentElement:{style},querySelector:()=>meta}});
 assert.equal(style['--startup-bg'],expected);assert.equal(style.backgroundColor,expected);assert.equal(meta.content,expected);
});
test('blocked storage still paints OS theme without trying to reset data',()=>{
 const style={setProperty(k,v){this[k]=v;}};
 vm.runInNewContext(source,{localStorage:{getItem(){throw Error('blocked');}},matchMedia:()=>({matches:true}),document:{documentElement:{style},querySelector:()=>null}});assert.equal(style.backgroundColor,'#1b1a16');
});
test('all entry documents install critical appearance and readiness before screen styles',()=>{
 for(const name of ['index','profile','assistant','progress']){
  const html=readFileSync(new URL('../public/'+name+'.html',import.meta.url),'utf8');assert.match(html,/<html[^>]*data-intake-starting/);assert.ok(html.indexOf('startup-theme.js')<html.indexOf('href="styles.css'));assert.ok(html.indexOf('startup.css')<html.indexOf('href="styles.css'));
 }
});
