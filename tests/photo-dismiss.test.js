import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoDismiss,photoDismissIntent,photoDismissEligible,photoDismissPose,photoDismissCommits,photoDismissDuration} from '../public/photo-dismiss.js';
const begin = (options={}) => createPhotoDismiss({x:100,y:100,at:0,height:700,scale:1,count:1,...options});
test('downward intent waits for slop and rejects ambiguous, horizontal and upward input',()=>{
  assert.equal(photoDismissIntent(0,10),'pending');assert.equal(photoDismissIntent(5,11),'dismiss');
  for(const [x,y] of [[20,15],[20,24],[0,-11],[-40,12]])assert.equal(photoDismissIntent(x,y),'ignore');
  const g=begin();assert.equal(g.move(130,110,20),null);assert.equal(g.move(130,400,50),null);assert.equal(g.end(51).commit,false);
});
test('only actual fit and a single fresh contact can recognize dismissal',()=>{
  assert.equal(photoDismissEligible(1,1),true);
  for(const [scale,count] of [[1.001,1],[2,1],[1,2],[1,0]]){assert.equal(photoDismissEligible(scale,count),false);assert.equal(begin({scale,count}),null);}
  assert.equal(begin({height:0}),null);
});
test('pose clamps progress, horizontal wobble, scaling and opacity without fading the image',()=>{
  assert.deepEqual(photoDismissPose(0,-12,700),photoDismissPose(0,0,700));
  const mid=photoDismissPose(40,140,700);assert.ok(Math.abs(mid.scale-.93)<1e-8);assert.equal(mid.scrim,.61);assert.equal(mid.chrome,.5);assert.match(mid.transform,/translate3d\(6px,140px,0\)/);
  const end=photoDismissPose(1000,800,700);assert.equal(end.progress,1);assert.equal(end.scale,.86);assert.ok(Math.abs(end.scrim-.22)<1e-8);assert.equal(end.chrome,0);assert.match(end.transform,/translate3d\(24px,800px,0\)/);assert.equal(end.opacity,undefined);
});
test('distance threshold is 26% of usable stage, independent of stale velocity',()=>{
  assert.equal(photoDismissCommits(181,700,0),false);assert.equal(photoDismissCommits(182,700,0),true);
  const g=begin();g.move(100,282,500);assert.equal(g.end(900).commit,true);
});
test('fast flick requires 72px minimum and .65px/ms recent downward velocity',()=>{
  for(const [dy,ms,release,expected] of [[71,40,41,false],[80,80,85,true],[80,200,201,false],[80,80,180,false]]){
    const g=begin();g.move(100,100+dy,ms);assert.equal(g.end(release).commit,expected);
  }
  const reverse=begin();reverse.move(100,240,80);reverse.move(100,190,100);assert.equal(reverse.end(101).commit,false);
});
test('active gesture owns reversal but cancellation never commits; fresh instance needed afterward',()=>{
  const g=begin();assert.ok(g.move(100,150,40));assert.ok(g.move(140,120,60));assert.equal(g.active,true);
  assert.equal(g.end(65,true).commit,false);assert.equal(g.active,false);assert.equal(g.move(100,600,80),null);assert.equal(g.end(90).active,false);
});
test('cancel duration is proportional and bounded 80–180ms',()=>{
  assert.equal(photoDismissDuration(0,700),80);assert.ok(photoDismissDuration(30,700)<photoDismissDuration(130,700));assert.equal(photoDismissDuration(2000,700),180);
});
