-- The audit log: every change is recorded (who, what, when). "Keep all logs" —
-- there is no soft-delete or purge in this build; the trail is append-only.
--
-- Single operator, so there is no users table to point at: `actor` is just the
-- recorded name (defaults to the operator) rather than a foreign key.

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL DEFAULT 'operator',
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_log_occurred_idx ON audit_log (occurred_at DESC, id DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);

-- The log is filtered by actor (case-insensitively) and by category (the part of
-- `action` before the first dot). Functional indexes keep those filters fast as
-- the log grows instead of degrading to a sequential scan.
CREATE INDEX audit_log_actor_lower_idx ON audit_log (lower(actor));
CREATE INDEX audit_log_category_idx ON audit_log (split_part(action, '.', 1));
