import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

test('Profile retains native compact time fields and one concise schedule explanation',()=>{
 const html=read('profile.html');
 for(const id of ['profileBreakfastEnd','profileLunchEnd'])assert.match(html,new RegExp(`id="${id}" type="time" required`));
 assert.equal((html.match(/class="settings-time-row"/g)||[]).length,2);
 assert.doesNotMatch(html,/id="mealSchedulePreview"/);assert.doesNotMatch(read('profile-settings.js'),/querySelector\("#mealSchedulePreview"\)/);
 assert.match(html,/id="mealScheduleReset" type="button"/);
 assert.match(read('profile-settings.css'),/\.settings-time-row input \{ width:116px;.*height:48px/);
});

test('Profile heading announcement focus is scoped and keyboard controls retain their focus style',()=>{
 const css=read('profile-settings.css');
 assert.match(css,/body\.profile-page:not\(\.first-run-onboarding\) #profilePageTitle\[tabindex="-1"\]:focus \{ outline: none; \}/);
 assert.match(css,/:is\(button,input,select,a\):focus-visible \{ outline: 2px solid var\(--ink\)/);
 assert.match(read('app-router.js'),/focusRouteHeading\(document\)/);
 assert.match(read('route-focus.js'),/heading.focus\(\{ preventScroll: true \}\)/);
});

test('targets preserve the 2x2 fields and secondary actions before truthful status',()=>{
 const html=read('profile.html'),css=read('profile-settings.css');
 for(const id of ['goalCalories','goalProtein','goalCarbs','goalFat'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 assert.ok(html.indexOf('id="goalResetButton"')<html.indexOf('id="profileTargetChange"'));
 assert.match(css,/\.settings-targets \{.*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:430px\)\s*\{\s*body.profile-page #profileSettings \.settings-target-actions \{ grid-template-columns:minmax\(0,1fr\)/);
 assert.doesNotMatch(css,/#profileSettings \{ padding-bottom: calc\(var\(--settings-nav-height/);
});
