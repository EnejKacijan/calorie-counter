import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {animateRouteContent,motionScale} from '../public/motion.js';
const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const app=read('app.js'),router=read('app-router.js');
const slice=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end));
function renderDay(selectedDate,days,{edit=false}={}){
 const events=[],elements=new Proxy({}, {get(t,k){return t[k]??=( {style:{},classList:{toggle(){}},textContent:''} );}});
 const context={state:{selectedDate,days,goals:{calories:2000,protein:140,carbs:240,fat:60}},elements,editingFoodId:edit?'food':null,addSurface:{section:edit?elements.foodSection:null},renderSnapshot:edit?{remaining:999,remainingRing:999}:null,recentSuccess:null,macroConfig:['protein','carbs','fat'].map(key=>({key})),document:{visibilityState:'visible'},
  currentDay(){return context.state.days[context.state.selectedDate];},applyTheme(){},renderProfileState(){},renderSavedFoods(){},
  renderMacros(daily){if(edit)assert.equal(context.renderSnapshot,null,'no previous macro frame behind Edit Food');events.push({kind:'macros',date:context.state.selectedDate,...daily});},
  renderCalendar(){events.push({kind:'calendar',date:context.state.selectedDate});},
  renderEntries(){events.push({kind:'diary',date:context.state.selectedDate,foods:context.currentDay().foods});},
  requestAnimationFrame(){assert.fail('first render must not queue a second pass');},setTimeout(){assert.fail('first render must not defer content');},
  window:{IntakeMotion:{reveal(){assert.fail('mount must not animate previous totals');}}},
 };
 vm.runInNewContext(slice('function totals() {','const streakWindowMs')+slice('function render() {','function applyTheme(')+slice('function setAnimatedMetric(','function playSubmitSuccess(')+'render();',context);
 return{context,events,elements};
}
const empty={foods:[],exercises:[]};
const populated={foods:[{calories:500,protein:30,carbs:50,fat:15}],exercises:[{calories:100}]};
test('Edit Food commits current totals/macros without replaying or scheduling old Today values',()=>{
 const r=renderDay('2026-09-18',{'2026-09-18':populated},{edit:true});
 assert.equal(r.elements.consumedCalories.textContent,'1600');assert.equal(r.context.renderSnapshot.remainingRing,1600);assert.equal(r.events.length,3);
});
for(const [name,day,remaining] of [['empty',empty,2000],['populated',populated,1600]])test(`atomic ${name} mount: ring, macros and diary use the same selected local day`,()=>{
 const r=renderDay('2026-09-18',{'2026-09-18':day,'2026-09-20':empty});
 assert.equal(r.elements.consumedCalories.textContent,String(remaining));
 assert.equal(r.events.length,3);assert.ok(r.events.every(e=>e.date==='2026-09-18'));
 assert.equal(r.events[2].foods,day.foods);assert.equal(r.events[0].calories,2000-remaining+(name==='populated'?100:0));
 assert.equal(r.context.renderSnapshot.remainingRing,remaining);
});
test('a changed day is committed fresh without reusing stale rendered totals',()=>{
 const old=renderDay('2026-09-18',{'2026-09-18':populated});
 const next=renderDay('2026-09-20',{'2026-09-18':populated,'2026-09-20':empty});
 assert.equal(old.elements.consumedCalories.textContent,'1600');assert.equal(next.elements.consumedCalories.textContent,'2000');assert.equal(next.events[2].foods.length,0);
});
test('route targets leave the fixed Add ancestry untransformed and keep shared timing',()=>{
 let selector,options;
 animateRouteContent({querySelectorAll(s){selector=s;return[];},querySelector(){return{};}},'/assistant.html','/index.html',{transition(_targets,kind,o){options={kind,...o};}});
 assert.equal(options.kind,'route');assert.equal(options.direction,-1);assert.equal(motionScale.route,170);
 const selectors=selector.split(',');
 for(const ancestor of ['.main-content','.workspace','#foodSection','.logged-list-heading','.log-heading-actions','.floating-action-stack','#floatingAddButton'])assert.ok(!selectors.includes(ancestor));
 assert.ok(!selector.includes('.log-heading-actions'));assert.ok(!selector.includes('.log-title-meta'));
 assert.ok(selectors.includes('#foodList'));assert.ok(selectors.includes('.exercise-list-heading'));
});
test('warm mount suppresses only the first-mount ring fade before synchronous rendering',()=>{
 const begin=app.indexOf('elements.calorieRing.classList.toggle("is-route-return"');
 assert.ok(begin>0);assert.match(app.slice(begin),/Boolean\(viewState.mounted\)\);\s*render\(\);\s*viewState.mounted = true;/);
 assert.match(read('styles.css'),/\.ring-progress\.is-route-return:not\(\.is-success-pulse\)\s*\{\s*animation: none;/);
 assert.match(router,/viewStates.get\(path\)/);
});
test('router commits template, complete mount and route semantics before motion, without a yield',()=>{
 const commit=router.slice(router.indexOf('    replaceScreen(template);'),router.indexOf('    };',router.indexOf('    replaceScreen(template);')));
 assert.ok(commit.indexOf('mount(module)')<commit.indexOf('animateRouteContent'));
 assert.doesNotMatch(commit,/await |setTimeout|requestAnimationFrame|animationend/);
 assert.match(router,/if \(ticket !== sequence\) return;/);
 assert.ok(router.indexOf('scope?.dispose()')<router.indexOf('    replaceScreen(template);'));
});
test('FAB is owned by the committed Today template, not a later mount callback',()=>{
 assert.equal((read('index.html').match(/id="floatingAddButton"/g)||[]).length,1);
 for(const other of ['assistant.html','progress.html','profile.html'])assert.doesNotMatch(read(other),/id="floatingAddButton"/);
 assert.doesNotMatch(app,/requestAnimationFrame\([^\n]*floatingAdd|setTimeout\([^\n]*floatingAdd/);
 assert.match(app,/const saved = localStorage.getItem\("calorie-counter-state"\)/);
});
