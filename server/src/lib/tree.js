// Pure helpers for the parameter and group trees (both are `parent_id` self-FK
// tables). Nothing here touches the database — callers pass in plain rows so the
// logic stays unit-testable.

// Build a forest from flat rows (each with `id` and `parentId`). Returns the
// root nodes; every node gets a `children` array. Order within a level follows
// the input order (callers sort first: sort_order, then name). Rows whose parent
// is missing from the set are treated as roots (defensive against archived gaps).
export function buildForest(rows) {
  const byId = new Map();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    const parent = row.parentId != null ? byId.get(row.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// Depth-first walk (parent before its children), invoking fn(node, depth).
export function walkForest(roots, fn, depth = 0) {
  for (const node of roots) {
    fn(node, depth);
    walkForest(node.children, fn, depth + 1);
  }
}

// Flatten a forest to an array in depth-first order, tagging each node with its
// `depth`. Handy for rendering an indented list or a <select>.
export function flattenForest(roots) {
  const out = [];
  walkForest(roots, (node, depth) => out.push({ ...node, depth }));
  return out;
}

// True if `ancestorId` is `nodeId` or an ancestor of it, per a parentId map.
// Used to prevent cycles before re-parenting (a node may not become a descendant
// of itself).
export function isAncestor(parentById, ancestorId, nodeId) {
  let current = nodeId;
  const seen = new Set();
  while (current != null) {
    if (current === ancestorId) return true;
    if (seen.has(current)) break; // corrupt data guard
    seen.add(current);
    current = parentById.get(current) ?? null;
  }
  return false;
}

// Collect a node's id plus every descendant id (the whole subtree), per a
// children map (id -> array of child ids).
export function subtreeIds(childrenById, rootId) {
  const out = [];
  const stack = [rootId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of childrenById.get(id) ?? []) stack.push(child);
  }
  return out;
}

// Arithmetic mean of the finite numbers in `values`, or null if none.
export function mean(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
