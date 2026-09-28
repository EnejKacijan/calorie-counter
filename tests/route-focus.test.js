import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {focusRouteHeading, routeHeadingSelector} from '../public/route-focus.js';

function fixture(options = [{}]) {
  const calls = [], document = {activeElement:null, querySelectorAll(selector) {
    assert.equal(selector, 'h1:not([role]):not([contenteditable])'); return elements;
  }};
  const elements = options.map(option => ({attributes:{}, tabIndex:0,
    getClientRects:() => option.hidden ? [] : [{}], closest:() => option.inert || false,
    setAttribute(name,value) {this.attributes[name]=value;}, removeAttribute(name) {delete this.attributes[name];},
    focus(value) { calls.push({element:this,options:value,marker:this.attributes['data-intake-route-focus'],tabIndex:this.tabIndex});
      if(!option.reject)document.activeElement=this; }
  }));
  return {document,elements,calls};
}

test('route heading is marked before synchronous focus, with preventScroll', () => {
  const f=fixture(); assert.equal(focusRouteHeading(f.document),true);
  assert.deepEqual(f.calls,[{element:f.elements[0],options:{preventScroll:true},marker:'heading',tabIndex:-1}]);
  assert.equal(f.document.activeElement,f.elements[0]);
});
test('route owner skips hidden/inert headings and selects the visible semantic title', () => {
  const f=fixture([{hidden:true},{inert:true},{}]); focusRouteHeading(f.document);
  assert.equal(f.calls.length,1); assert.equal(f.calls[0].element,f.elements[2]);
});
test('route focus never falls back to body or an arbitrary control', () => {
  for(const options of [[],[{hidden:true}],[{inert:true}]]) {
    const f=fixture(options);assert.equal(focusRouteHeading(f.document),false);assert.equal(f.calls.length,0);
  }
  assert.equal(routeHeadingSelector,'h1:not([role]):not([contenteditable])');
});
test('failed route focus does not leave a visual-suppression marker', () => {
  const f=fixture([{reject:true}]); assert.equal(focusRouteHeading(f.document),false);
  assert.deepEqual(f.elements[0].attributes,{});
});
test('route focus commits before route motion and does not introduce blur/timer/scroll compensation', () => {
  const router=readFileSync(new URL('../public/app-router.js',import.meta.url),'utf8');
  const owner=readFileSync(new URL('../public/route-focus.js',import.meta.url),'utf8');
  assert.ok(router.indexOf('focusRouteHeading(document)') < router.indexOf('if (!completing) animateRouteContent'));
  assert.doesNotMatch(owner,/\.blur\(|setTimeout|requestAnimationFrame|scrollTo|\.click\(/);
  assert.doesNotMatch(router,/heading\.focus\(/);
});
test('quiet styling requires an explicitly managed non-interactive heading, not a global focus reset', () => {
  const css=readFileSync(new URL('../public/modern-ux.css',import.meta.url),'utf8');
  assert.match(css,/h1\[data-intake-route-focus="heading"\]\[tabindex="-1"\]:not\(\[role\]\):not\(\[contenteditable\]\):focus\s*\{ outline: none; \}/);
  assert.doesNotMatch(css,/\*:(?:focus|focus-visible)\s*\{[^}]*outline:\s*none/);
});
