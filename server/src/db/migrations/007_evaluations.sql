-- Evaluations: the entered scores. This is the heart of the model.
--
-- A student is scored SEPARATELY inside each group they belong to, and a group
-- may also hold its OWN scores. So every score is anchored to a group, and the
-- student is optional:
--   * student_id IS NOT NULL  -> a student's score, within group_id
--   * student_id IS NULL       -> the group's own direct score, for group_id
-- group_id is therefore ALWAYS present. (A student with no group has no scores
-- until placed in one.)
--
-- Only LEAF parameters are scored here; a parent's value is averaged from its
-- children at read time (see 005). `value` is nullable so a cell can exist as
-- "not entered yet" (e.g. carrying only a comment). The value is NOT range-
-- checked against the parameter's min/max in the DB: parameter ranges may change
-- over time and old scores must stay valid — validation lives in app code.
--
-- Scores reference stable parameter_id + period_id; those rows are soft-archived
-- rather than deleted, so reshaping parameters or re-dating periods never orphans
-- a score. locked_at marks a cell as locked (edits then require an explicit
-- override); it is nullable and set by app logic, not by a schedule here.

CREATE TABLE evaluations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES student_groups (id) ON DELETE CASCADE,
  student_id   uuid REFERENCES students (id) ON DELETE CASCADE,
  parameter_id uuid NOT NULL REFERENCES parameters (id),
  period_id    uuid NOT NULL REFERENCES periods (id),
  value        numeric,
  comment      text,
  locked_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_comment_length CHECK (comment IS NULL OR char_length(comment) <= 500)
);

-- One score per (group, student, parameter, period); and, for a group's own
-- scores, one per (group, parameter, period). NULL student_id is treated as
-- distinct by Postgres, so the two cases need separate partial unique indexes.
CREATE UNIQUE INDEX evaluations_student_unique
  ON evaluations (group_id, student_id, parameter_id, period_id)
  WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX evaluations_group_unique
  ON evaluations (group_id, parameter_id, period_id)
  WHERE student_id IS NULL;

CREATE INDEX evaluations_parameter_idx ON evaluations (parameter_id);
CREATE INDEX evaluations_period_idx    ON evaluations (period_id);
CREATE INDEX evaluations_group_idx     ON evaluations (group_id);
CREATE INDEX evaluations_student_idx   ON evaluations (student_id) WHERE student_id IS NOT NULL;
