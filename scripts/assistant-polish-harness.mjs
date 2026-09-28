import {pw,setup,settle,out,base,keyboard,closeKeyboard} from './add-flow-harness.mjs';
export {pw,settle,out,base,keyboard,closeKeyboard};
export const conversationKey='calorie-counter-assistant-conversations-v1';
export async function assistantFixture(browser,options={}) {
 const {p,c}=await setup(browser,options);
 await p.evaluate(()=>{
  const state=JSON.parse(localStorage.getItem('calorie-counter-state'));
  for(let offset=0;offset<=30;offset++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-offset);const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');state.days[key]={foods:[{id:'qa-'+offset,name:'QA oats '+offset,meal:'breakfast',amount:150,unit:'g',calories:200,protein:12,carbs:30,fat:4}],exercises:[]};}
  localStorage.setItem('calorie-counter-state',JSON.stringify(state));localStorage.setItem('calorie-counter-ai-consent-v1','{"assistant":true}');
 });
 const requests=[],errors=[];let outcome='ok',pending,reply='Your diary includes regular protein sources.\n\n• Oats and yogurt appear at breakfast.\n• Lunch portions vary across the week.\n\nThese are patterns in what you logged, not a diagnosis.';
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/assistant/chat',async r=>{requests.push(r.request().postDataJSON());if(outcome==='pending'){pending=r;return;}await r.fulfill({status:outcome==='fail'?503:200,json:outcome==='fail'?{error:'Could not reach Intake. Try again.'}:{message:reply}});});
 await p.goto(base+'/assistant.html');await p.waitForFunction(()=>!document.body.hasAttribute('data-app-loading'));await settle(p);
 const idle=async()=>{await p.waitForFunction(()=>!document.querySelector('#assistantInput').disabled);await settle(p);};
 return {p,c,requests,errors,idle,setOutcome:v=>outcome=v,setReply:v=>reply=v,release:async()=>{if(!pending)throw Error('No pending request');await pending.fulfill({json:{message:reply}});pending=null;},
  send:async text=>{await p.locator('#assistantInput').fill(text);await p.locator('#assistantSend').click();await idle();},saved:()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),conversationKey)};
}
