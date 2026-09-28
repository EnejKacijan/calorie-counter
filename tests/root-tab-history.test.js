import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../public/app-router.js', import.meta.url), 'utf8');
const nested = readFileSync(new URL('../public/nested-page.js', import.meta.url), 'utf8');
const scanner = readFileSync(new URL('../public/package-scan.js', import.meta.url), 'utf8');
const assistant = readFileSync(new URL('../public/assistant.js', import.meta.url), 'utf8');

test('top-level route commits replace their current history entry', () => {
  const commit = router.slice(router.indexOf('const commit = () => {'), router.indexOf('current = url;', router.indexOf('const commit = () => {')));
  assert.match(commit, /if \(!pop\) history\.replaceState\(\{ intakeIndex: historyIndex \}, "", url\)/);
  assert.doesNotMatch(commit, /history\.pushState/);
  assert.match(router, /path === routePath\(current\) && url\.search === current\.search && url\.hash === current\.hash/, 'alias-equivalent selected tab is a no-op');
  assert.match(router, /\["\/assistant", "\/assistant\.html"\]/);
  assert.match(router, /\["\/progress", "\/progress\.html"\]/);
  assert.match(router, /\["\/profile", "\/profile\.html"\]/);
});

test('hierarchical child surfaces still own real same-URL history entries', () => {
  assert.match(nested, /win\.history\.pushState/);
  assert.match(scanner, /window\.history\.pushState/);
  assert.match(assistant, /window\.history\.pushState/);
});
