import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroupTree,
  parentByIdMap,
  childrenByIdMap,
  wouldCreateCycle,
  groupSubtreeIds,
} from '../src/lib/groups.js';

const rows = [
  { id: 'a', parentId: null, name: 'A' },
  { id: 'b', parentId: 'a', name: 'B' },
  { id: 'c', parentId: 'a', name: 'C' },
  { id: 'd', parentId: 'b', name: 'D' },
  { id: 'e', parentId: null, name: 'E' },
];

test('buildGroupTree nests the group forest', () => {
  const roots = buildGroupTree(rows);
  assert.deepEqual(roots.map((r) => r.id), ['a', 'e']);
  assert.deepEqual(roots[0].children.map((c) => c.id), ['b', 'c']);
});

test('parentByIdMap maps each group to its parent (null for roots)', () => {
  const map = parentByIdMap(rows);
  assert.equal(map.get('a'), null);
  assert.equal(map.get('d'), 'b');
});

test('childrenByIdMap maps each group to its direct children', () => {
  const map = childrenByIdMap(rows);
  assert.deepEqual(map.get('a'), ['b', 'c']);
  assert.deepEqual(map.get('b'), ['d']);
  assert.deepEqual(map.get('c'), []);
});

test('wouldCreateCycle guards self- and descendant-parenting', () => {
  assert.equal(wouldCreateCycle(rows, 'a', null), false);
  assert.equal(wouldCreateCycle(rows, 'a', 'a'), true);
  assert.equal(wouldCreateCycle(rows, 'a', 'd'), true); // d is under a
  assert.equal(wouldCreateCycle(rows, 'b', 'c'), false);
  assert.equal(wouldCreateCycle(rows, 'd', 'a'), false); // moving d under a is fine
});

test('groupSubtreeIds collects a group and all descendants', () => {
  assert.deepEqual(groupSubtreeIds(rows, 'a').sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual(groupSubtreeIds(rows, 'e'), ['e']);
});
