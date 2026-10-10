-- Periods: named, dated scoring rounds. Unlike the old global "period number"
-- rhythm, each period is an explicit span (start_date..end_date) with a name,
-- "anchored until changed" — editing a period edits this row; every score keeps
-- pointing at the same period_id, so re-dating or renaming never orphans a score.
--
-- Periods are designed on a Periods page and ASSIGNED to students and/or groups
-- (period_assignments). A student's evaluation surface inside a group shows the
-- periods assigned to that group (and its ancestors) plus the student's own.
-- Periods are soft-archived, never hard-deleted once scored.

CREATE TABLE periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT period_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT period_date_order CHECK (start_date <= end_date)
);

CREATE INDEX periods_start_idx ON periods (start_date);

-- Assign a period to a student or a group (exactly one target per row).
CREATE TABLE period_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id  uuid NOT NULL REFERENCES periods (id) ON DELETE CASCADE,
  group_id   uuid REFERENCES student_groups (id) ON DELETE CASCADE,
  student_id uuid REFERENCES students (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT period_assignment_one_target
    CHECK ((group_id IS NOT NULL) <> (student_id IS NOT NULL))
);

CREATE UNIQUE INDEX period_assignments_group_unique
  ON period_assignments (period_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX period_assignments_student_unique
  ON period_assignments (period_id, student_id) WHERE student_id IS NOT NULL;
