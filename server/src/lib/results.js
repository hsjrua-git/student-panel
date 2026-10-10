import { rollupValues } from './parameters.js';
import { flattenForest, mean } from './tree.js';

// Pure builders for the results surface. Scores live per group (a group's own
// scores use student_id NULL; a member's use their id). Only LEAF parameters are
// scored; every parent value is rolled up from its children at read time via
// rollupValues, so reshaping the parameter tree never rewrites score history.

// One row per parameter node (parents included, rolled up) for a group in a
// period: the group's OWN value plus an aggregate across its members.
//   ownValueByLeaf : Map<leafId, number>            the group's own scores
//   memberMaps     : [{ studentId, valueByLeaf }]   each member's leaf scores
export function buildGroupResults(roots, { ownValueByLeaf = new Map(), memberMaps = [] } = {}) {
  const ownRolled = rollupValues(roots, ownValueByLeaf);
  const memberRolled = memberMaps.map((m) => rollupValues(roots, m.valueByLeaf));

  return flattenForest(roots).map((node) => {
    const memberValues = memberRolled
      .map((rolled) => rolled.get(node.id))
      .filter((v) => typeof v === 'number' && Number.isFinite(v));
    return {
      id: node.id,
      parentId: node.parentId ?? null,
      name: node.name,
      unit: node.unit,
      depth: node.depth,
      isLeaf: node.isLeaf,
      effective: node.effective,
      own: ownRolled.get(node.id) ?? null,
      members: {
        avg: mean(memberValues),
        min: memberValues.length ? Math.min(...memberValues) : null,
        max: memberValues.length ? Math.max(...memberValues) : null,
        count: memberValues.length,
      },
    };
  });
}

// One row per parameter node for a single student within a group: that student's
// rolled-up value per parameter (StudentDetail / a single column).
export function buildStudentResults(roots, valueByLeaf = new Map()) {
  const rolled = rollupValues(roots, valueByLeaf);
  return flattenForest(roots).map((node) => ({
    id: node.id,
    parentId: node.parentId ?? null,
    name: node.name,
    unit: node.unit,
    depth: node.depth,
    isLeaf: node.isLeaf,
    effective: node.effective,
    value: rolled.get(node.id) ?? null,
  }));
}
