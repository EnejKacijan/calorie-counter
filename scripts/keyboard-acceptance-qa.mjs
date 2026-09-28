// One connected keyboard-only journey supplements the touch/PWA matrix.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {preparePwa,preparePwaPage} from './pwa-qa-context.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.INTAKE_URL||'http://127.0.0.1:3002';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});await preparePwa(context,390);
 await context.addInitScript(()=>localStorage.setItem('calorie-counter-ai-consent-v1',JSON.stringify({assistant:true})));
 const p=await context.newPage();await preparePwaPage(p);await p.route('**/api/assistant/chat',r=>r.fulfill({json:{message:'Keyboard response.'}}));
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 async function reach(selector){const target=p.locator(selector);await target.waitFor();for(let i=0;i<100;i++){if(await target.evaluate(e=>e===document.activeElement))return;await p.keyboard.press('Tab');}assert.fail(`Tab order cannot reach ${selector}`);}
 async function activate(selector){await reach(selector);await p.keyboard.press('Enter');}
 async function type(selector,value){await reach(selector);await p.keyboard.press('ControlOrMeta+A');await p.keyboard.type(value);}
 await p.goto(`${base}/profile.html`);await p.locator('#onboarding[data-step="0"]').waitFor();await activate('#onboarding button[type=submit]');await p.locator('#onboarding[data-step="1"]').waitFor();
 await reach('[name=goalType][value=lose]');await p.keyboard.press('Space');await activate('#onboarding button[type=submit]');
 await reach('[name=sex][value=male]');await p.keyboard.press('Space');
 for(const [key,value]of Object.entries({age:'30',heightCm:'180',weightKg:'75',targetWeightKg:'70'}))await type('#onboarding-'+key,value);await activate('#onboarding button[type=submit]');
 await reach('[name=activityMultiplier][value="1.2"]');await p.keyboard.press('Space');await activate('#onboarding button[type=submit]');await p.locator('#onboarding[data-step="4"]').waitFor();await activate('#onboarding button[type=submit]');await p.locator('.day-tile').first().waitFor();
 await activate('#floatingAddButton');await activate('#manualFoodShortcut');await type('#manualFoodName','Keyboard food');for(const [id,value]of Object.entries({manualFoodCalories:'150',manualFoodProtein:'5',manualFoodCarbs:'20',manualFoodFat:'4'}))await type(`#${id}`,value);await activate('#manualFoodSubmit');
 await activate('.mobile-tabbar a[href="assistant.html"]');await p.locator('#assistantContextDisclosure').waitFor();await type('#assistantInput','Keyboard question');await p.keyboard.press('Enter');await p.keyboard.type('Second line');assert.match(await p.locator('#assistantInput').inputValue(),/\n/);await activate('#assistantSend');await p.locator('.assistant-message.is-assistant').waitFor();await activate('#assistantHistoryOpen');
 // The accepted nested surface deliberately autofocuses its title, not Close.
 await p.waitForFunction(()=>document.activeElement.id==='assistantHistoryTitle');await reach('#assistantHistoryClose');assert.ok(await p.locator('#assistantHistoryClose').evaluate(e=>e.matches(':focus-visible')));await p.keyboard.press('Escape');await p.waitForFunction(()=>document.activeElement.id==='assistantHistoryOpen');
 await activate('.mobile-tabbar a[href="profile.html"]');await p.locator('#profileSettingsOverview').waitFor();await activate('[data-edit-settings=personal]');await type('#profileName','Keyboard profile');await activate('#profileSubmitButton');await p.locator('#profileSettingsOverview').waitFor();
 // Onboarding already created today's weight. Edit that entry rather than
 // expecting Add to silently replace a duplicate date.
 await activate('.mobile-tabbar a[href="progress.html"]');await p.locator('#progressChart').waitFor();await activate('[data-edit-weight]');await type('#progressWeight','74,5');await activate('#weightSave');
 const s=await p.evaluate(()=>JSON.parse(localStorage.getItem('calorie-counter-state')));assert.equal(s.user.name,'Keyboard profile');assert.ok(s.progress.some(e=>e.weightKg===74.5));assert.ok(Object.values(s.days).some(d=>d.foods.some(f=>f.name==='Keyboard food')));assert.deepEqual(errors,[]);
 console.log('PASS keyboard-only onboarding, first manual food, top-level tabs, multiline Assistant/send/history/Escape focus restore, Profile personal Save, Progress weight Save. No mouse/click/fill/focus shortcuts.');
}finally{await browser.close();}
