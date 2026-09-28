import {pw,setup,out,openFood} from './add-flow-harness.mjs';
import {settle,drag,instrument,captureRendered} from './edge-row-harness.mjs';
export {pw,out,settle,drag,captureRendered};
export async function fixture(b,options={}){
 const f=await setup(b,{...options,beforeOpen:async({c})=>{await c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));}}),{p}=f;
 await openFood(p);await p.locator('#manualFoodName').fill('banana');await p.locator('#manualFoodName').press('Enter');await p.locator('.suggestion-card').first().waitFor();await settle(p);
 await p.evaluate(()=>{window.qaParent=document.querySelector('.add-flow-host');window.qaInput=document.querySelector('#manualFoodName');window.qaResult=document.querySelector('.suggestion-card');window.qaForm=document.querySelector('#manualFoodForm');});
 await p.evaluate(instrument);await p.evaluate(()=>{
  const previous=edgeSample;window.scannerBackClicks=0;
  document.addEventListener('click',e=>{if(e.target.closest('.package-scan-close'))scannerBackClicks++;},true);
  window.edgeSample=()=>{const a=previous(),d=document.querySelector('.unified-scanner'),t=document.querySelector('#foodScanButton'),s=getComputedStyle(t);return{...a,dialog:d&&{rect:d.getBoundingClientRect().toJSON(),backdrop:getComputedStyle(d,'::backdrop').backgroundColor,active:d.dataset.edgeBackActive,exiting:d.classList.contains('is-exiting'),mode:d.querySelector('[aria-pressed=true]')?.dataset.mode},sameParent:qaParent===document.querySelector('.add-flow-host'),sameInput:qaInput===document.querySelector('#manualFoodName'),sameResult:qaResult===document.querySelector('.suggestion-card'),sameForm:qaForm===document.querySelector('#manualFoodForm'),query:qaInput.value,filter:document.querySelector('[data-food-filter].is-active')?.dataset.foodFilter,results:document.querySelector('#foodSuggestions').textContent,parentScroll:document.querySelector('.add-flow-content').scrollTop,backClicks:scannerBackClicks,focusVisible:t.matches(':focus-visible'),outline:s.outlineStyle,paint:[s.color,s.backgroundColor,s.borderColor,s.boxShadow],pressed:document.querySelectorAll('[data-touch-pressed],[data-add-pressed],[data-sheet-pressed],.is-pressed').length};};
 });return f;
}
export async function openScanner(p){await p.locator('#foodScanButton').tap();await p.locator('.unified-scanner').waitFor();await settle(p);}
export const sample=p=>p.evaluate(()=>edgeSample());
