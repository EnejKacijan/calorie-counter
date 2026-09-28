import { motionScale } from './motion.js?v=7';
const curve=motionScale.easing.match(/[\d.]+/g).map(Number);

const rect = value => {
  if (!value) return null;
  const r = value.getBoundingClientRect ? value.getBoundingClientRect() : value;
  const top = r.top ?? r.y, left = r.left ?? r.x ?? 0;
  return {top,left,bottom:r.bottom ?? top+r.height,right:r.right ?? left+r.width,height:r.height ?? r.bottom-top};
};
export function disclosureRegion(values) {
  const rows = (Array.isArray(values) ? values : [values]).map(rect).filter(r => r && r.height > 0);
  if (!rows.length) return null;
  const top=Math.min(...rows.map(r=>r.top)),bottom=Math.max(...rows.map(r=>r.bottom));
  return {top,bottom,height:bottom-top,left:Math.min(...rows.map(r=>r.left)),right:Math.max(...rows.map(r=>r.right))};
}
export function disclosureViewport({owner, viewport, topOcclusion=[], bottomOcclusion=[]}) {
  let top=Math.max(owner.top,viewport.top),bottom=Math.min(owner.bottom,viewport.bottom);
  const overlaps=r=>r && r.right>owner.left && r.left<owner.right && r.bottom>top && r.top<bottom;
  for(const value of topOcclusion){const r=rect(value);if(overlaps(r))top=Math.max(top,r.bottom);}
  for(const value of bottomOcclusion){const r=rect(value);if(overlaps(r))bottom=Math.min(bottom,r.top);}
  return {top,bottom,height:Math.max(0,bottom-top)};
}
// Tiny disclosures retain nearest-edge reveal. Explicit substantial content
// focuses its beginning, without a displacement cap or chasing its last row.
export function disclosureDelta({viewport,region,trigger,preferredRegion,policy='nearest',anchor=trigger,contentGap=12}) {
  if (!region || viewport.height<=0) return 0;
  if(policy==='content-focus'){
    const beginning=anchor || trigger || region;
    const full=disclosureRegion([beginning,trigger,region]);
    const gap=Math.min(Math.max(0,contentGap),viewport.height/4);
    const comfortable=full.top>=viewport.top+gap && full.bottom<=viewport.bottom-gap;
    if(comfortable && beginning.top<viewport.top+viewport.height/2)return 0;
    return beginning.top-viewport.top-gap;
  }
  let target=disclosureRegion([trigger,region]);
  if(target.height>viewport.height){
    target=region.height<=viewport.height ? region : disclosureRegion([trigger,preferredRegion||{...region,bottom:Math.min(region.bottom,region.top+viewport.height),height:Math.min(region.height,viewport.height)}]);
    if(target.height>viewport.height)target={...target,bottom:target.top+viewport.height,height:viewport.height};
  }
  if(target.top<viewport.top)return target.top-viewport.top;
  if(target.bottom>viewport.bottom)return target.bottom-viewport.bottom;
  return 0;
}
export function disclosureScrollOwner(trigger,win) {
  for(let node=trigger.parentElement;node && node!==win.document.body;node=node.parentElement){
    // overflow-x can compute overflow-y:auto on an otherwise unbounded page
    // wrapper. It is not the scroll owner unless it has actual vertical range.
    if(/^(auto|scroll)$/.test(win.getComputedStyle(node).overflowY) && node.scrollHeight>node.clientHeight+1)return node;
  }
  return win.document.scrollingElement;
}
// The same .2,.7,.2,1 curve as the existing disclosure's height animation.
export function disclosureEase(x) {
  const axis=(t,a,b)=>3*(1-t)**2*t*a+3*(1-t)*t*t*b+t*t*t;
  let low=0,high=1,t=x;
  for(let i=0;i<16;i++){if(axis(t,curve[0],curve[2])<x)low=t;else high=t;t=(low+high)/2;}
  return axis(t,curve[1],curve[3]);
}
export const disclosureRevealDuration = 200;

// Read the final layout of known inline height disclosures without finishing,
// restarting or temporarily restyling their live animations. Earlier openings
// move this anchor too; a latest request must include that remaining movement.
export function disclosureLayoutOffsets(anchor,regions=[]) {
  let shift=0,growth=0;
  for(const {element,expanded} of regions){
    if(!element?.getAnimations?.().some(a=>a.effect?.getKeyframes().some(f=>'height' in f)))continue;
    const box=rect(element);if(!box)continue;
    const change=(expanded?element.scrollHeight:0)-box.height;
    growth+=change;
    if(box.top<anchor.top && box.bottom<=anchor.top+1)shift+=change;
  }
  return {shift,growth};
}

// Geometry only: callers commit their own open state. A page owns one current
// operation so a later disclosure/user gesture always wins without closing any
// other section. Nothing is inserted, focused, blurred or persisted here.
export function createDisclosureReveal(win) {
  const doc=win.document,listeners=[];let operation=null,frame=0,disposed=false;
  const listen=(target,type,fn,options={capture:true,passive:true})=>{
    target?.addEventListener(type,fn,options);listeners.push(()=>target?.removeEventListener(type,fn,options));
  };
  function cancel(){win.cancelAnimationFrame(frame);frame=0;operation=null;}
  for(const type of ['pointerdown','touchstart','wheel','click'])listen(doc,type,cancel);
  listen(doc,'keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Tab','Escape','Enter'].includes(e.key))cancel();});
  listen(doc,'focusin',e=>{if(e.target.matches?.('input,textarea,select,[contenteditable=true]'))cancel();});
  listen(doc,'scroll',e=>{
    if(!operation)return;
    const {owner,expected}=operation;
    if((e.target===owner || e.target===doc && owner===doc.scrollingElement) && Math.abs(owner.scrollTop-expected)>1)cancel();
  });
  listen(win,'resize',cancel);listen(win.visualViewport,'resize',cancel);listen(win.visualViewport,'scroll',cancel);
  listen(win,'popstate',cancel);listen(win,'blur',cancel);
  listen(doc,'visibilitychange',()=>{if(doc.hidden)cancel();});
  const preference=win.matchMedia('(prefers-reduced-motion: reduce)');listen(preference,'change',cancel);
  const resolve=value=>typeof value==='function'?value():value;
  const live=node=>node?.isConnected && node.getClientRects().length && !node.closest('[inert]');
  function reveal({scrollContainer,trigger,expandedRegion,preferredRegion,policy='nearest',anchor,contentGap=12,layoutRegions=[],pendingLayoutGrowth=0,topOcclusion=[],bottomOcclusion=[],isCurrent=()=>true,reducedMotion}={}) {
    cancel();if(disposed || !trigger)return;
    const owner=resolve(scrollContainer)||disclosureScrollOwner(trigger,win);
    const op={owner,expected:owner.scrollTop};operation=op;
    const valid=()=>operation===op && !disposed && isCurrent() && live(trigger) && owner.isConnected && (win.visualViewport?.scale??1)===1;
    // Two paint boundaries also let the existing Add ResizeObserver establish
    // its content scroller before measuring. No timeout or guessed duration.
    frame=win.requestAnimationFrame(()=>{frame=win.requestAnimationFrame(()=>{
      frame=0;if(!valid()){if(operation===op)cancel();return;}
      const root=owner===doc.scrollingElement,vv=win.visualViewport;
      const viewport={top:vv?.offsetTop||0,bottom:(vv?.offsetTop||0)+(vv?.height||win.innerHeight)};
      const box=root?{top:0,bottom:doc.documentElement.clientHeight,left:0,right:doc.documentElement.clientWidth}:rect(owner);
      if(!root){box.top+=owner.clientTop;box.bottom=box.top+owner.clientHeight;}
      const usable=disclosureViewport({owner:box,viewport,topOcclusion:resolve(topOcclusion),bottomOcclusion:resolve(bottomOcclusion)});
      const initialAnchor=rect(resolve(anchor))||rect(trigger),layout=disclosureLayoutOffsets(initialAnchor,resolve(layoutRegions));
      const finalRect=value=>value&&({...value,top:value.top+layout.shift,bottom:value.bottom+layout.shift});
      const measuredAnchor=finalRect(initialAnchor);
      const delta=disclosureDelta({viewport:usable,trigger:finalRect(rect(trigger)),region:finalRect(disclosureRegion(resolve(expandedRegion))),preferredRegion:finalRect(disclosureRegion(resolve(preferredRegion))),policy,anchor:measuredAnchor,contentGap});
      const start=owner.scrollTop,max=Math.max(0,owner.scrollHeight-owner.clientHeight+layout.growth+Math.max(0,resolve(pendingLayoutGrowth)));
      const target=Math.max(0,Math.min(max,start+delta)),distance=target-start;
      if(Math.abs(distance)<.5){cancel();return;}
      const write=top=>{owner.scrollTo({left:owner.scrollLeft,top,behavior:'instant'});op.expected=owner.scrollTop;};
      if(reducedMotion??preference.matches){write(target);cancel();return;}
      const begin=win.performance.now();
      const tick=now=>{
        frame=0;if(!valid()){if(operation===op)cancel();return;}
        const progress=Math.min(1,Math.max(0,(now-begin)/disclosureRevealDuration));
        write(progress===1?target:start+distance*disclosureEase(progress));
        if(progress<1)frame=win.requestAnimationFrame(tick);else cancel();
      };
      frame=win.requestAnimationFrame(tick);
    });});
  }
  return {reveal,cancel,dispose(){disposed=true;cancel();listeners.splice(0).forEach(remove=>remove());},get active(){return Boolean(operation);}};
}
