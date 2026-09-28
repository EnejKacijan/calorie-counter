import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function code(name){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start)+2;assert.ok(start>=0&&end>start);return source.slice(start,end);}
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.style={setProperty(){}};this.classList={add:name=>this.className+=' '+name};this.parentElement={dataset:{}};}
 append(...nodes){this.children.push(...nodes);} appendChild(node){this.append(node);}
 setAttribute(key,value){this.attributes[key]=value;}
 set textContent(value){this.text=value;this.children=[];} get textContent(){return this.text??this.children.map(n=>n.textContent).join('');}
 querySelector(){return new Element();}
}
function fixture(names,overrides={}){const c=vm.createContext({document:{createElement:tag=>new Element(tag)},diaryRowSwipe:{reset(){}},...overrides});vm.runInContext(names.map(code).join('\n'),c);return c;}

test('empty food has one neutral description, two primary/secondary buttons and a real tertiary button',()=>{
 const list=new Element(),c=fixture(['createDiaryEmptyAction','renderFoodDiary'],{elements:{foodList:list}});c.renderFoodDiary([]);
 const empty=list.children[0];assert.equal(empty.children[0].textContent,'No food logged.');
 assert.deepEqual(empty.children[1].children.map(b=>[b.type,b.dataset.emptyFoodAction,b.textContent]),[['button','add','Add food'],['button','scan','Scan food']]);
 const reuse=empty.children[2];assert.equal(reuse.type,'button');assert.equal(reuse.dataset.emptyFoodAction,'reuse');assert.equal(reuse.children[0].textContent,'Reuse food or meals');assert.equal(reuse.children[1].attributes['aria-hidden'],'true');assert.equal(reuse.children[1].textContent,'›');
});
test('empty exercise has neutral text and a semantic secondary button without a chevron',()=>{
 const list=new Element(),c=fixture(['createDiaryEmptyAction','renderList']);c.renderList(list,[],'exercises',()=>assert.fail());
 const empty=list.children[0];assert.equal(empty.children[0].tagName,'p');assert.equal(empty.children[0].textContent,'No exercise logged.');
 const add=empty.children[1];assert.equal(add.tagName,'button');assert.equal(add.type,'button');assert.equal(add.dataset.emptyExerciseAction,'add');assert.equal(add.className,'diary-empty-exercise-add');assert.equal(add.textContent,'Add exercise');assert.equal(add.children.length,0);assert.equal(empty.attributes.role,undefined);
});

test('Today owns one shared footer/FAB clearance for both empty and populated diaries',()=>{
 const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
 assert.match(css,/--today-bottom-clearance: calc\(var\(--mobile-nav-height\) \+ var\(--today-fab-size\) \+ var\(--today-fab-nav-gap\) \+ var\(--today-end-gap\)\)/);
 assert.match(css,/\.main-content:has\(#dashboardSection\)\s*\{[^}]*padding-bottom: var\(--today-bottom-clearance\) !important/s);
 assert.doesNotMatch(css,/padding-bottom: calc\((?:80|136)px \+ env\(safe-area-inset-bottom\)\)/);
 assert.match(css,/\.exercise-log\.log-panel:not\(\.is-adding\)\s*\{\s*padding-bottom: 0 !important/);
 assert.match(css,/bottom: calc\(var\(--mobile-nav-height\) \+ var\(--today-fab-nav-gap\)\)/);
});

test('empty Exercise treatment keeps touch/focus feedback and removes only its terminal boundaries',()=>{
 const css=readFileSync(new URL('../public/today-diary.css',import.meta.url),'utf8');
 assert.match(css,/#exerciseList \.diary-empty-exercise-add \{[^}]*min-height:44px[^}]*border:1px solid var\(--line\)/s);
 assert.match(css,/#exerciseList \.diary-empty-exercise-add:active:where\(:not\(\[data-intake-touch\] \*\),\[data-touch-pressed\]\)/);
 assert.match(css,/\.diary-empty button:focus-visible \{ outline: 2px solid var\(--ink\)/);
 assert.match(css,/\.exercise-log:has\(> #exerciseList > \.diary-empty\) > \.logged-list-heading/);
 assert.match(css,/#exerciseList > \.diary-empty \{[^}]*padding-bottom:0!important;border:0!important/);
 assert.match(css,/#diaryFeedback \{ margin:0; \}/);
 assert.doesNotMatch(css,/diary-empty-exercise-add:hover/);
});

test('mobile empty diary shares the 16px action rhythm and gives Food reuse a 12px secondary gap',()=>{
 const css=readFileSync(new URL('../public/today-diary.css',import.meta.url),'utf8');
 assert.match(css,/@media \(max-width:640px\) \{[^}]*\}[\s\S]*?\.diary-empty \{\s*--diary-empty-action-gap:16px;\s*--diary-empty-secondary-gap:12px;/);
 assert.match(css,/body :is\(#foodList,#exerciseList\) \.diary-empty > p \{ margin-bottom:var\(--diary-empty-action-gap\); \}/);
 assert.match(css,/body #foodList \.diary-empty \.diary-empty-action \{ margin-top:var\(--diary-empty-secondary-gap\); \}/);
 assert.match(css,/body #exerciseList \.diary-empty > p \{ margin-bottom:var\(--diary-empty-action-gap,16px\); \}/);
});
for(const [foods,exercises] of [[0,0],[1,0],[0,1],[2,3]])test(`header count visibility reflects only emptiness: ${foods} foods / ${exercises} exercises`,()=>{
 const elements=Object.fromEntries(['foodList','exerciseList','foodSection','exerciseSection','foodEntryCount','exerciseEntryCount','foodLogOptionsButton'].map(k=>[k,new Element()]));
 const day={foods:Array(foods).fill({}),exercises:Array(exercises).fill({})},before=JSON.stringify(day);
 const c=fixture(['renderEntries'],{elements,currentDay:()=>day,selectedLogHeading:()=>"Yesterday's log",syncFoodModeHeader(){},syncExerciseModeHeader(){},renderFoodDiary(){},updateFoodSwipeHint(){},renderList(){}});c.renderEntries();
 for(const [count,key]of[[foods,'foodEntryCount'],[exercises,'exerciseEntryCount']]){assert.equal(elements[key].hidden,count===0);assert.equal(elements[key].textContent,`${count} ${count===1?'entry':'entries'}`);}
 assert.equal(JSON.stringify(day),before);
 // Removing the final entry and adding one later changes only visibility/count.
 day.foods=[];day.exercises=[];c.renderEntries();assert.equal(elements.foodEntryCount.hidden,true);assert.equal(elements.exerciseEntryCount.hidden,true);
 day.foods=[{}];day.exercises=[{}];c.renderEntries();assert.equal(elements.foodEntryCount.hidden,false);assert.equal(elements.exerciseEntryCount.hidden,false);
});
test('empty exercise action delegates to the existing Add owner without changing selected date',()=>{
 let listener,opens=0;const c={elements:{exerciseList:{addEventListener(type,fn){assert.equal(type,'click');listener=fn;}}},openAddExerciseFromFab(){opens++;},state:{selectedDate:'2026-09-18'}};
 const start=source.indexOf("elements.exerciseList.addEventListener('click'");vm.runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),c);
 listener({target:{closest:()=>null}});assert.equal(opens,0);listener({target:{closest:()=>({})}});assert.equal(opens,1);assert.equal(c.state.selectedDate,'2026-09-18');
});
