export async function recordAudit(
  db,
  { userId = null, actor, action, entityType = null, entityId = null, details = {} }
) {
  await db.query(
    `INSERT INTO audit_log (user_id, actor, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, actor, action, entityType, entityId, JSON.stringify(details)]
  );
}