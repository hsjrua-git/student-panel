-- Students (the people being evaluated) and their custom-field definitions.
--
-- Mandatory facts: full_name, student_code, birthdate, gender. Everything else
-- is optional and lives in `extra` (a JSONB map keyed by field-definition id, so
-- a field can be renamed without touching stored values). A student may exist
-- WITHOUT a group ("no group by default"); they simply have no evaluations until
-- placed in one (scores are always recorded under a group — see evaluations).

CREATE TABLE students (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code text NOT NULL UNIQUE,
  full_name    text NOT NULL,
  birthdate    date NOT NULL,
  gender       text NOT NULL,
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT student_code_format
    CHECK (student_code ~ '^[2-9A-HJ-NP-Z]{8}$'),
  CONSTRAINT full_name_length
    CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 100),
  CONSTRAINT gender_length
    CHECK (char_length(btrim(gender)) BETWEEN 1 AND 40),
  -- Guard against obviously-wrong dates while staying permissive.
  CONSTRAINT birthdate_range
    CHECK (birthdate BETWEEN DATE '1900-01-01' AND DATE '2100-01-01')
);

-- Operator-defined optional fields for students. Values live in students.extra,
-- keyed by definition id. `is_restricted` fields are hidden unless the viewer
-- opts to reveal them (a soft privacy flag in the single-operator build).
CREATE TABLE student_field_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  field_type    text NOT NULL,
  choices       jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_restricted boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_label_length CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  CONSTRAINT field_type_valid CHECK (
    field_type IN ('text', 'long_text', 'number', 'date', 'yes_no', 'choice')
  )
);

CREATE UNIQUE INDEX student_field_definitions_label_unique
  ON student_field_definitions (lower(label))
  WHERE archived_at IS NULL;
