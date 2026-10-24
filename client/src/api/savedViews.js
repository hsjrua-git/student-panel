// Saved views api — on-device adapter over the savedViews service (was fetch to
// /api/saved-views). listSavedViews unwraps .views; create/update unwrap .view;
// delete returns void — all matching the previous shapes.

import { callService } from './local.js';
import {
  listViews,
  createView,
  updateView,
  deleteView,
} from '@server/core/services/savedViews.js';

export async function listSavedViews() {
  const { views } = await callService(() => listViews());
  return views;
}

export async function createSavedView({ name, config }) {
  const { view } = await callService(() => createView({ name, config }));
  return view;
}

export async function updateSavedView(id, fields) {
  const { view } = await callService(() => updateView(id, fields));
  return view;
}

export function deleteSavedView(id) {
  return callService(() => deleteView(id));
}
