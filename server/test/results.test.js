import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParameterTree } from '../src/lib/parameters.js';
import { buildGroupResults, buildStudentResults } from '../src/lib/results.js';

const rows = [
  { id: 'p', parentId: null, name: 'Parent', unit: 'u', minValue: 0, maxValue: 100, normMin: 40, normMax: 60 },
  { id: 'c1', parentId: 'p', name: 'C1', unit: 'u', minValue: 10, maxValue: 50, normMin: 20, normMax: 30 },
  { id: 'c2', parentId: 'p', name: 'C2', unit: 'u', minValue: 5, maxValue: 80, normMin: 25, normMax: 45 },
];
const roots = buildParameterTree(rows);

test('buildGroupResults rolls up the group own value and aggregates members', () => {
  const out = buildGroupResults(roots, {
    ownValueByLeaf: new Map([['c1', 10], ['c2', 20]]),
    memberMaps: [
      { studentId: 's1', valueByLeaf: new Map([['c1', 10], ['c2', 30]]) },
      { studentId: 's2', valueByLeaf: new Map([['c1', 20], ['c2', 40]]) },
    ],
  });
  const parent = out.find((r) => r.id === 'p');
  assert.equal(parent.own, 15); // mean(10, 20)
  // member p-values: s1 -> mean(10,30)=20, s2 -> mean(20,40)=30
  assert.deepEqual(parent.members, { avg: 25, min: 20, max: 30, count: 2 });
  assert.equal(parent.isLeaf, false);
  assert.deepEqual(parent.effective, { minValue: 5, maxValue: 80, normMin: 20, normMax: 45 });
});

test('buildGroupResults reports null/zero aggregates when there are no members', () => {
  const out = buildGroupResults(roots, { ownValueByLeaf: new Map([['c1', 10]]) });
  const leaf = out.find((r) => r.id === 'c1');
  assert.equal(leaf.own, 10);
  assert.deepEqual(leaf.members, { avg: null, min: null, max: null, count: 0 });
});

test('buildStudentResults rolls each parameter up for one student', () => {
  const out = buildStudentResults(roots, new Map([['c1', 10], ['c2', 20]]));
  assert.deepEqual(out.map((r) => `${r.id}=${r.value}`), ['p=15', 'c1=10', 'c2=20']);
});

test('results rows carry parentId and DFS depth', () => {
  const out = buildStudentResults(roots, new Map());
  assert.deepEqual(out.map((r) => `${r.id}@${r.depth}`), ['p@0', 'c1@1', 'c2@1']);
  assert.equal(out[1].parentId, 'p');
});
