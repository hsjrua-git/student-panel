-- Tasks: work items given to students and/or groups. Properties are intentionally
-- open for now (`extra` jsonb holds custom fields, rules TBD with the operator).
--
-- A task MAY reference a parameter (optional) so it can later relate to a score,
-- but a task is NOT a score. Each assignment carries a completion flag (`done`):
-- a checkbox that MAY influence evaluation in a future rule, decided later. For
-- now it is recorded and shown, nothing more. Tasks are soft-archived.

CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  parameter_id uuid REFERENCES parameters (id) ON DELETE SET NULL,
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order   integer NOT NULL DEFAULT 0,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT task_description_length CHECK (description IS NULL OR char_length(description) <= 2000)
);

CREATE INDEX tasks_parameter_idx ON tasks (parameter_id);

-- Give a task to a student or a group (exactly one target per row). An optional
-- period_id scopes the task to a period. `done`/`done_at` is the completion
-- checkbox.
CREATE TABLE task_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  group_id   uuid REFERENCES student_groups (id) ON DELETE CASCADE,
  student_id uuid REFERENCES students (id) ON DELETE CASCADE,
  period_id  uuid REFERENCES periods (id) ON DELETE SET NULL,
  done       boolean NOT NULL DEFAULT false,
  done_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_assignment_one_target
    CHECK ((group_id IS NOT NULL) <> (student_id IS NOT NULL))
);

CREATE UNIQUE INDEX task_assignments_group_unique
  ON task_assignments (task_id, group_id, period_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX task_assignments_student_unique
  ON task_assignments (task_id, student_id, period_id) WHERE student_id IS NOT NULL;

CREATE INDEX task_assignments_student_idx ON task_assignments (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX task_assignments_group_idx   ON task_assignments (group_id) WHERE group_id IS NOT NULL;
