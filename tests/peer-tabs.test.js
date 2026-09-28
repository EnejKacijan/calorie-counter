import test from 'node:test';
import assert from 'node:assert/strict';
import { peerIntent, peerCommits, peerSettleDuration, peerTravel, peerPageSpan, peerTiming } from '../public/peer-tabs.js';

test('peer intent keeps vertical scrolling native until horizontal intent is clear', () => {
  assert.equal(peerIntent(4, 1), 'pending');
  assert.equal(peerIntent(28, 8), 'horizontal');
  assert.equal(peerIntent(28, 24), 'vertical');
  assert.equal(peerIntent(2, 25), 'vertical');
  assert.equal(peerIntent(Infinity, 1), 'ignore');
});

test('peer commit uses one adjacent pane threshold or a deliberate flick', () => {
  assert.equal(peerCommits(110, 390, 0), true);
  assert.equal(peerCommits(70, 390, 0), false);
  assert.equal(peerCommits(48, 390, .7), true);
  assert.equal(peerCommits(30, 390, 1), false);
  assert.equal(peerCommits(70, 390, -.8), false, 'reversing velocity is not a forward flick');
  assert.equal(peerSettleDuration(0, 390, true), 210);
  assert.equal(peerSettleDuration(195, 390, false), 105);
});

test('peer travel clamps overdrag and reversal without changing adjacent destination', () => {
  assert.equal(peerTravel(-150, 1, 300), 150);
  assert.equal(peerTravel(150, -1, 300), 150);
  assert.equal(peerTravel(-500, 1, 300), 300);
  assert.equal(peerTravel(50, 1, 300), 0);
  assert.equal(peerTiming.duration, 190);
});
test('adjacent peer panes retain a narrow visible 8px gutter without shortening finger travel', () => {
  assert.equal(peerPageSpan(390, 8), 398);
  assert.equal(peerTravel(-210, 1, peerPageSpan(390, 8)), 210);
  assert.equal(peerTravel(-500, 1, peerPageSpan(390, 8)), 398);
  assert.equal(peerCommits(110, 390, 0), true, 'commit threshold still uses pane width');
});

test('peer tab source is a bounded content transition with semantic release, not a top-level route gesture', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../public/app.js', import.meta.url), 'utf8'));
  assert.match(source, /createPeerTabs\(\{/);
  assert.match(source, /viewport: document.querySelector\('#foodFilterViewport'\)/);
  assert.match(source, /foodSearchFilter = fromFilter;/);
  assert.match(source, /replaceChildren\(\.\.\.snapshot.nodes\)/);
  assert.match(source, /point.clientX <= surface.getBoundingClientRect\(\).left \+ 24/);
  assert.doesNotMatch(source, /mobile-tabbar.*peerSwap/);
});

test('fixed-width track cannot shrink panes or reorder the stationary filter strip', async () => {
  const read = file => import('node:fs/promises').then(({readFile}) => readFile(new URL('../public/' + file, import.meta.url), 'utf8'));
  const [css, foodCss, html, source] = await Promise.all(['modern-ux.css','food-search.css','index.html','peer-tabs.js'].map(read));
  assert.match(css, /\.peer-pane-track[^}]*display: flex; width: 100%/);
  assert.match(css, /\.peer-pane-track[^}]*gap: 8px/);
  assert.match(css, /flex: 0 0 100%; min-width: 100%; max-width: 100%/);
  assert.match(foodCss, /\.food-filter-viewport[^}]*order: 3 !important/);
  assert.match(foodCss, /\.food-filter-viewport[^}]*overflow: hidden/);
  assert.match(foodCss, /#manualFoodForm:not\(\[data-food-detail\]\) \{ min-height: 100% !important; \}/);
  assert.match(foodCss, /\.food-filter-viewport \{ display: flex;[^}]*flex: 1 0 auto/);
  assert.match(foodCss, /\.food-filter-pane \{[^}]*flex: 0 0 100%/);
  assert.match(foodCss, /\.food-filter-viewport > \.peer-pane-track \{[^}]*align-items: stretch/);
  const pane = html.slice(html.indexOf('id="foodFilterViewport"'), html.indexOf('<section class="scan-review"'));
  assert.doesNotMatch(pane, /data-food-filter=/);
  assert.match(pane, /data-peer-results[\s\S]*data-peer-actions[\s\S]*id="manualFoodShortcut"[\s\S]*id="foodAiDescriptionTrigger"/);
  assert.equal((html.match(/id="manualFoodShortcut"/g) || []).length, 1);
  assert.equal((html.match(/id="foodAiDescriptionTrigger"/g) || []).length, 1);
  assert.match(source, /Math.max\(height, pane.getBoundingClientRect\(\).height\)/);
  assert.match(source, /session.track.replaceWith\(pane\)/);
  assert.match(source, /copy.inert = true; copy.setAttribute\('aria-hidden', 'true'\)/);
  assert.doesNotMatch(source.match(/const excluded = ([^;]+);/)?.[1] || '', /button|\.manual-food-shortcut|\.food-ai-description-trigger/);
  assert.doesNotMatch(source.match(/const excluded = ([^;]+);/)?.[1] || '', /(?:^|,)img|(?:^|,)svg/);
  assert.match(source, /guardResidualClick\(win\)/);
  assert.match(source, /event.timeStamp - contact.at < 100/);
  assert.match(source, /getSelection/);
  assert.match(source, /edgeOwns\(point, event\)/);
});

test('USDA remains the final shared peer pane, including when its results are empty', async () => {
  const { readFile } = await import('node:fs/promises');
  const [html, app, css] = await Promise.all(['index.html', 'app.js', 'food-search.css'].map(file =>
    readFile(new URL('../public/' + file, import.meta.url), 'utf8')));
  assert.deepEqual([...html.matchAll(/data-food-filter="([^"]+)"/g)].map(match => match[1]), ['all', 'my', 'recent', 'usda']);
  assert.equal((html.match(/class="food-filter-pane"/g) || []).length, 1);
  assert.match(app, /dataset\.peerFilter = nextFilter/);
  assert.match(app, /dataset\.peerFilter = foodSearchFilter/);
  assert.doesNotMatch(css, /\.food-filter-pane\[data-peer-filter="usda"\] \{ min-height:/);
});

test('Food fallback actions use pane-local visibility and the outgoing snapshot keeps its own presentation', async () => {
  const { readFile } = await import('node:fs/promises');
  const [foodCss, addCss, peer] = await Promise.all(['food-search.css', 'add-flow.css', 'peer-tabs.js'].map(file =>
    readFile(new URL('../public/' + file, import.meta.url), 'utf8')));
  assert.match(foodCss, /\.food-filter-pane:has\(\.food-search-fallbacks,\.food-search-error\) \.manual-food-shortcut/);
  assert.match(addCss, /\.food-filter-pane:has\(\.food-search-fallbacks,\.food-search-error\) \.manual-food-shortcut/);
  assert.match(peer, /'\.manual-food-shortcut', '\.food-ai-description-trigger'/);
  assert.match(peer, /pane.inert = true/);
  assert.match(peer, /pane.inert = session.inert/);
});
