import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForest,
  walkForest,
  flattenForest,
  isAncestor,
  subtreeIds,
  mean,
} from '../src/lib/tree.js';

const rows = [
  { id: 'a', parentId: null, name: 'A' },
  { id: 'b', parentId: 'a', name: 'B' },
  { id: 'c', parentId: 'a', name: 'C' },
  { id: 'd', parentId: 'b', name: 'D' },
  { id: 'e', parentId: null, name: 'E' },
];

test('buildForest nests children and preserves input order', () => {
  const roots = buildForest(rows);
  assert.deepEqual(roots.map((r) => r.id), ['a', 'e']);
  assert.deepEqual(roots[0].children.map((c) => c.id), ['b', 'c']);
  assert.deepEqual(roots[0].children[0].children.map((c) => c.id), ['d']);
  assert.deepEqual(roots[1].children, []);
});

test('buildForest treats rows with a missing parent as roots', () => {
  const roots = buildForest([{ id: 'x', parentId: 'ghost', name: 'X' }]);
  assert.deepEqual(roots.map((r) => r.id), ['x']);
});

test('walkForest visits parent before children with depth', () => {
  const seen = [];
  walkForest(buildForest(rows), (node, depth) => seen.push(`${node.id}@${depth}`));
  assert.deepEqual(seen, ['a@0', 'b@1', 'd@2', 'c@1', 'e@0']);
});

test('flattenForest returns depth-tagged DFS order', () => {
  const flat = flattenForest(buildForest(rows));
  assert.deepEqual(flat.map((n) => `${n.id}@${n.depth}`), ['a@0', 'b@1', 'd@2', 'c@1', 'e@0']);
});

test('isAncestor walks parent links and guards corrupt cycles', () => {
  const parentById = new Map([['a', null], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['e', null]]);
  assert.equal(isAncestor(parentById, 'a', 'd'), true);
  assert.equal(isAncestor(parentById, 'd', 'd'), true);
  assert.equal(isAncestor(parentById, 'b', 'c'), false);
  assert.equal(isAncestor(parentById, 'e', 'd'), false);
  assert.equal(isAncestor(new Map([['x', 'y'], ['y', 'x']]), 'z', 'x'), false);
});

test('subtreeIds collects a node and all descendants', () => {
  const childrenById = new Map([['a', ['b', 'c']], ['b', ['d']], ['c', []], ['d', []], ['e', []]]);
  assert.deepEqual(subtreeIds(childrenById, 'a').sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual(subtreeIds(childrenById, 'e'), ['e']);
});

test('mean ignores non-finite values and returns null when empty', () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(mean([2, null, '3', NaN, 4]), 3);
  assert.equal(mean([]), null);
  assert.equal(mean([null, undefined]), null);
});
