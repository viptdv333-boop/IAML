// Audit trail for admin writes and security-relevant events.
export async function audit(db, actorId, action, entity, entityId = null, meta = {}) {
  await db.query(
    'insert into audit_log (actor_id, action, entity, entity_id, meta) values ($1, $2, $3, $4, $5)',
    [actorId ?? null, action, entity, entityId == null ? null : String(entityId), JSON.stringify(meta ?? {})],
  );
}
