import {assistantFixture,pw,out,keyboard,closeKeyboard,conversationKey} from './assistant-polish-harness.mjs';
import {settle} from './edge-row-harness.mjs';
export {assistantFixture,pw,out,keyboard,closeKeyboard,settle};
export async function seed(p){
 await p.evaluate(key=>{
  const messages=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:i%2?
   (i%4===1?'A short answer.':`A longer synthetic answer ${i}.\n\n`+'These are sample diary observations for layout testing. '.repeat(12)+'\n\n• First list item.\n• Second list item.\n• Third list item.'):`Sample question ${i}`,createdAt:new Date(1700000000000+i*1000).toISOString()}));
  localStorage.setItem(key,JSON.stringify([{id:'jump-qa',title:'Jump control QA',messages,createdAt:messages[0].createdAt,updatedAt:messages.at(-1).createdAt,diaryEnabled:true,diaryRange:7}]));
  sessionStorage.setItem('calorie-counter-assistant-active-conversation-session-v1','jump-qa');
 },conversationKey);
 await p.reload();await p.locator('.assistant-message').last().waitFor();await settle(p);
}
export async function scroll(p,top){await p.locator('.assistant-conversation').evaluate((e,top)=>{
 e.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:top<e.scrollTop?-100:100}));e.scrollTop=top;
},top);await settle(p);}
export const measure=p=>p.evaluate(()=>{
 const q=s=>document.querySelector(s),rect=e=>e?.getBoundingClientRect().toJSON(),j=q('#assistantJumpLatest'),face=j.querySelector('.assistant-jump-face'),r=q('.assistant-conversation');
 const hit=e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button')?.id;};
 return{jump:rect(j),face:rect(face),footer:rect(q('.assistant-chat-footer')),context:rect(q('#assistantContextDisclosure')),composer:rect(q('#assistantForm')),input:rect(q('#assistantInput')),send:rect(q('#assistantSend')),header:rect(q('.assistant-header')),region:rect(r),
  top:r.scrollTop,height:r.scrollHeight,view:r.clientHeight,distance:r.scrollHeight-r.clientHeight-r.scrollTop,follow:r.dataset.chatFollow,hidden:j.hidden,inert:j.inert,
  jumpHit:hit(j),diaryHit:hit(q('#assistantContextDisclosure')),name:j.getAttribute('aria-label'),parent:j.parentElement.className,mask:getComputedStyle(r).maskImage,
  display:getComputedStyle(j).display,opacity:getComputedStyle(j).opacity,faceOpacity:face&&getComputedStyle(face).opacity,faceTransition:face&&getComputedStyle(face).transitionDuration,outline:getComputedStyle(j).outlineStyle,
  viewport:{top:visualViewport.offsetTop,height:visualViewport.height},docTop:scrollY,overflow:document.documentElement.scrollWidth>innerWidth,count:q('#assistantMessages').children.length};
});
export async function keyboardMask(p,show=true){await p.evaluate(show=>{
 document.querySelector('#qaJumpKeyboard')?.remove();if(!show)return;
 const mask=document.createElement('div');mask.id='qaJumpKeyboard';mask.textContent='Keyboard area — simulated viewport';
 Object.assign(mask.style,{position:'fixed',top:(visualViewport.offsetTop+visualViewport.height)+'px',bottom:'0',left:'0',right:'0',padding:'28px 20px',font:'14px/1.5 sans-serif',background:'#30302d',color:'#ddd',zIndex:20000,pointerEvents:'none'});document.body.append(mask);
},show);}
