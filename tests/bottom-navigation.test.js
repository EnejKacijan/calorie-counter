import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountNavigationPress} from '../public/bottom-navigation.js';
const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const paths=[
 'M5 10.25 12 4.5l7 5.75V20H5z M9.5 20v-6.25h5V20z',
 'M4.5 5.5h15v10.5h-8.25L7.5 19.5V16h-3z',
 'M4 13.5h3.5V20H4z M10.25 9.5h3.5V20h-3.5z M16.5 5h3.5v15h-3.5z',
 'M15.6 7.5a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 0 1 7.2 0z M5.5 20.5a6.5 6.5 0 0 1 13 0z',
];
const routes=['index','assistant','progress','profile'];
for(const route of routes)test(`C2 ${route}: four semantic links, exact study geometry and first-render current state`,()=>{
 const html=read(route+'.html'),nav=html.match(/<nav class="mobile-tabbar[^]*?<\/nav>/)[0];
 assert.deepEqual([...nav.matchAll(/href="(.*?)"/g)].map(m=>m[1]),routes.map(r=>r+'.html'));
 assert.deepEqual([...nav.matchAll(/<b class="nav-label">(.*?)<\/b>/g)].map(m=>m[1]),['Today','Assistant','Progress','Profile']);
 assert.deepEqual([...nav.matchAll(/<path d="(.*?)"/g)].map(m=>m[1]),paths);
 assert.equal((nav.match(/aria-current="page"/g)||[]).length,1);
 assert.ok(nav.includes(`class="is-active" aria-current="page" href="${route}.html"`));
 assert.equal((nav.match(/viewBox="0 0 24 24" aria-hidden="true" focusable="false"/g)||[]).length,4);
 assert.doesNotMatch(nav,/<title|aria-label="(?:Today|Assistant|Progress|Profile)"|motion-selection/);
 assert.match(html,/bottom-navigation.css/);
});
test('nav press feedback handles primary pointer, release outside, cancel, blur and route cleanup',()=>{
 const events={},global={},doc={},classes=new Set(),link={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}};
 const nav={inert:false,contains:e=>e===link,addEventListener:(n,f)=>events[n]=f};
 const win={addEventListener:(n,f)=>global[n]=f,document:{visibilityState:'visible',addEventListener:(n,f)=>doc[n]=f}};
 const clear=mountNavigationPress(nav,win),press=(over={})=>events.pointerdown({target:{closest:()=>link},isPrimary:true,button:0,pointerId:4,...over});
 press({isPrimary:false});assert.equal(classes.size,0);press({button:2});assert.equal(classes.size,0);
 nav.inert=true;press();assert.equal(classes.size,0);nav.inert=false;
 press();assert.ok(classes.has('is-pressed'));global.pointerup({pointerId:5});assert.ok(classes.has('is-pressed'));global.pointerup({pointerId:4});assert.equal(classes.size,0);
 for(const close of [()=>global.pointercancel({pointerId:4}),()=>global.blur(),()=>{win.document.visibilityState='hidden';doc.visibilitychange();},clear]){press();close();assert.equal(classes.size,0);}
});
test('C2 owns geometry, outline/fill and reduced motion without selection pseudo-elements',()=>{
 const css=read('bottom-navigation.css');
 for(const text of ['--mobile-nav-content-height: 58px','repeat(4, minmax(0, 1fr))','width: 22px; height: 22px','gap: 3px','600 11px/13px','letter-spacing: .06em','white-space: nowrap','fill-opacity: 0','fill-opacity: 1','font-weight: 700','outline-offset: -4px','prefers-reduced-motion: reduce','-webkit-tap-highlight-color: transparent'])assert.ok(css.includes(text),text);
 assert.doesNotMatch(css,/::before|::after|motion-selection|92px|34px/);
 assert.doesNotMatch(read('styles.css'),/mobile-tabbar[^{}]*::(?:before|after)/);
 assert.doesNotMatch(read('modern-ux.css'),/mobile-tabbar/);
 assert.match(read('styles.css'),/padding-bottom: var\(--mobile-nav-height\)/);
 assert.ok(read('sw.js').includes('"/bottom-navigation.css"'));
});
