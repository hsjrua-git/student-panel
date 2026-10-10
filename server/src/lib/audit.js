export async function recordAudit(
  db,
  { actor = 'operator', action, entityType = null, entityId = null, details = {} }
) {
  await db.query(
    `INSERT INTO audit_log (actor, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor, action, entityType, entityId, JSON.stringify(details)]
  );
}
