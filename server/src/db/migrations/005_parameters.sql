-- Parameters (what you measure) form a tree of any depth, mirroring groups.
--
--   P1 -> (Pa, Pb);  Pa -> (Pi, Pii, Piii)
--
-- Only LEAF parameters (no live children) carry entered scores. A parent's value
-- is DERIVED at read time as the average of its children (average(Pi,Pii,Piii) =
-- Pa; average(Pa,Pb) = P1); a parent's effective range is the widest of its
-- children (min = lowest child min, max = highest child max). Nothing derived is
-- stored, so the tree can be reshaped without rewriting history.
--
-- `norm` is an optional target and MAY be a range: norm_min..norm_max. A single
-- target is norm_min = norm_max. Charts draw it as a band (range) or line (point).
-- `extra` holds any other custom fields (rules to be defined later).
--
-- Parameters are SOFT-archived (archived_at) rather than deleted once scored, so
-- adding or removing a parameter over time never invalidates existing scores.

CREATE TABLE parameters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES parameters (id),
  name        text NOT NULL,
  unit        text,
  min_value   numeric,
  max_value   numeric,
  norm_min    numeric,
  norm_max    numeric,
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order  integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parameter_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT parameter_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT parameter_range_order
    CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value),
  CONSTRAINT parameter_norm_order
    CHECK (norm_min IS NULL OR norm_max IS NULL OR norm_min <= norm_max)
);

-- Names unique among live siblings (root parameters share one namespace).
CREATE UNIQUE INDEX parameters_root_name_unique
  ON parameters (lower(name))
  WHERE parent_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX parameters_child_name_unique
  ON parameters (parent_id, lower(name))
  WHERE parent_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX parameters_parent_idx ON parameters (parent_id);

-- Which parameters apply to which group or student, so not every parameter has
-- to apply to everyone. An EITHER/OR link: exactly one of group_id/student_id is
-- set. Applicability for a (student, group) pair = assignments on that group and
-- its ancestors, plus assignments on that student.
CREATE TABLE parameter_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id uuid NOT NULL REFERENCES parameters (id) ON DELETE CASCADE,
  group_id     uuid REFERENCES student_groups (id) ON DELETE CASCADE,
  student_id   uuid REFERENCES students (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parameter_assignment_one_target
    CHECK ((group_id IS NOT NULL) <> (student_id IS NOT NULL))
);

CREATE UNIQUE INDEX parameter_assignments_group_unique
  ON parameter_assignments (parameter_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX parameter_assignments_student_unique
  ON parameter_assignments (parameter_id, student_id) WHERE student_id IS NOT NULL;
