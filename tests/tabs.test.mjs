import test from 'node:test';
import assert from 'node:assert/strict';
import { tabbed, resetTab } from '../src/client/tabs.js';

const defs = [{ id: 'a', label: 'Alpha', status: 'ok' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }];

test('splits marked sections into accessible tabs, keeps prefix and suffix outside, and drops empty panels', () => {
  resetTab('t1');
  const html = tabbed('t1', 'HEAD<!--tab:a--><p>one</p><!--tab:b-->  <!--tab:c--><p>three</p><!--/tabs--><button>Save</button>', defs);
  assert.ok(html.startsWith('HEAD<div class="vs-tabs" data-tabs="t1">'), 'prefix stays above the tabs');
  assert.ok(html.endsWith('</div><button>Save</button>'), 'suffix stays below, always visible');
  assert.equal((html.match(/role="tab"/g) || []).length, 2, 'the empty panel b has no tab');
  assert.match(html, /aria-selected="true"[^>]*>Alpha<span class="vs-tab-dot ok"/);
  assert.match(html, /id="panel-t1-a"[^>]*aria-labelledby="tab-t1-a" >|id="panel-t1-a"[^>]*aria-labelledby="tab-t1-a"\s*>/);
  assert.match(html, /id="panel-t1-c"[^>]*hidden/, 'inactive panels are rendered but hidden so their fields keep working');
  assert.ok(html.includes('<p>one</p>') && html.includes('<p>three</p>'));
});

test('fewer than two panels renders the content without a tab bar; unknown markers are ignored; labels are escaped', () => {
  assert.equal(tabbed('t2', '<!--tab:a--><p>only</p>', defs), '<p>only</p>');
  assert.equal(tabbed('t2', 'plain page', defs), 'plain page');
  assert.ok(!tabbed('t2', '<!--tab:x-->nope<!--tab:a-->yes', defs).includes('vs-tabs'));
  const html = tabbed('t3', '<!--tab:a-->A<!--tab:b-->B', [{ id: 'a', label: '<img onerror=x>' }, { id: 'b', label: 'B' }]);
  assert.ok(!html.includes('<img onerror') && html.includes('&lt;img onerror=x&gt;'));
});
