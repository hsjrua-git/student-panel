import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParameterTree,
  rollupValues,
  leafIds,
} from '../src/lib/parameters.js';

const rows = [
  { id: 'p', parentId: null, name: 'Parent', unit: 'u', minValue: 0, maxValue: 100, normMin: 40, normMax: 60 },
  { id: 'c1', parentId: 'p', name: 'C1', unit: 'u', minValue: 10, maxValue: 50, normMin: 20, normMax: 30 },
  { id: 'c2', parentId: 'p', name: 'C2', unit: 'u', minValue: 5, maxValue: 80, normMin: 25, normMax: 45 },
  { id: 'leaf', parentId: null, name: 'Leaf', unit: 'u', minValue: 1, maxValue: 9, normMin: 3, normMax: 7 },
];

test('buildParameterTree marks leaves and parents', () => {
  const roots = buildParameterTree(rows);
  const [p, standalone] = roots;
  assert.equal(p.isLeaf, false);
  assert.equal(standalone.isLeaf, true);
  assert.equal(p.children[0].isLeaf, true);
});

test('a parent effective range is the widest span of its children', () => {
  const [p] = buildParameterTree(rows);
  assert.deepEqual(p.effective, { minValue: 5, maxValue: 80, normMin: 20, normMax: 45 });
});

test('a leaf effective range is its own stored values', () => {
  const roots = buildParameterTree(rows);
  const leaf = roots[1];
  assert.deepEqual(leaf.effective, { minValue: 1, maxValue: 9, normMin: 3, normMax: 7 });
});

test('rollupValues: leaf = entered value, parent = mean of children', () => {
  const roots = buildParameterTree(rows);
  const out = rollupValues(roots, new Map([['c1', 10], ['c2', 20], ['leaf', 5]]));
  assert.equal(out.get('c1'), 10);
  assert.equal(out.get('c2'), 20);
  assert.equal(out.get('p'), 15);
  assert.equal(out.get('leaf'), 5);
});

test('rollupValues: a parent ignores a missing child and is null when empty', () => {
  const roots = buildParameterTree(rows);
  assert.equal(rollupValues(roots, new Map([['c1', 10]])).get('p'), 10);
  assert.equal(rollupValues(roots, new Map()).get('p'), null);
});

test('leafIds lists only leaves in DFS order', () => {
  assert.deepEqual(leafIds(buildParameterTree(rows)), ['c1', 'c2', 'leaf']);
});
