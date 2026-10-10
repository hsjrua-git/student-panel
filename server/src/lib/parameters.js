import pool from '../db/pool.js';
import { buildForest, mean, walkForest } from './tree.js';

// Read + shape the parameter tree, and the pure roll-up math parents inherit
// from their children. Only LEAF parameters are scored; parents are derived at
// read time (value = average of children; range/norm = widest of children).

const COLUMNS = `
  id,
  parent_id   AS "parentId",
  name,
  unit,
  min_value   AS "minValue",
  max_value   AS "maxValue",
  norm_min    AS "normMin",
  norm_max    AS "normMax",
  extra,
  sort_order  AS "sortOrder",
  archived_at AS "archivedAt",
  created_at  AS "createdAt"
`;

const toNum = (v) => (v === null || v === undefined ? null : Number(v));

function shape(row) {
  return {
    ...row,
    minValue: toNum(row.minValue),
    maxValue: toNum(row.maxValue),
    normMin: toNum(row.normMin),
    normMax: toNum(row.normMax),
  };
}

export async function fetchParameterRows(db = pool, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
  const result = await db.query(
    `SELECT ${COLUMNS} FROM parameters ${where}
     ORDER BY sort_order, lower(name)`
  );
  return result.rows.map(shape);
}

const lowest = (values) => {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length ? Math.min(...nums) : null;
};
const highest = (values) => {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length ? Math.max(...nums) : null;
};

// Attach `isLeaf` and an `effective` { minValue, maxValue, normMin, normMax } to
// every node. A leaf's effective values are its own; a parent's are the widest
// span of its children (falling back to its own stored value if children give
// none). Mutates and returns the node.
function computeEffective(node) {
  if (node.children.length === 0) {
    node.isLeaf = true;
    node.effective = {
      minValue: node.minValue,
      maxValue: node.maxValue,
      normMin: node.normMin,
      normMax: node.normMax,
    };
    return node;
  }
  node.isLeaf = false;
  node.children.forEach(computeEffective);
  const eff = node.children.map((c) => c.effective);
  node.effective = {
    minValue: lowest(eff.map((e) => e.minValue)) ?? node.minValue,
    maxValue: highest(eff.map((e) => e.maxValue)) ?? node.maxValue,
    normMin: lowest(eff.map((e) => e.normMin)) ?? node.normMin,
    normMax: highest(eff.map((e) => e.normMax)) ?? node.normMax,
  };
  return node;
}

export function buildParameterTree(rows) {
  const roots = buildForest(rows);
  roots.forEach(computeEffective);
  return roots;
}

// Given the parameter tree and a map of leaf-parameter-id -> entered value,
// compute every node's value (leaf = its entered value; parent = mean of its
// children's computed values) and return a Map of id -> value (null if none).
export function rollupValues(roots, valueByLeafId) {
  const out = new Map();
  function visit(node) {
    if (node.isLeaf) {
      const v = valueByLeafId.get(node.id);
      const value = typeof v === 'number' && Number.isFinite(v) ? v : null;
      out.set(node.id, value);
      return value;
    }
    const childValues = node.children.map(visit);
    const value = mean(childValues);
    out.set(node.id, value);
    return value;
  }
  roots.forEach(visit);
  return out;
}

// Ids of all live leaf parameters in the tree (the only scoreable ones).
export function leafIds(roots) {
  const out = [];
  walkForest(roots, (node) => {
    if (node.isLeaf) out.push(node.id);
  });
  return out;
}
