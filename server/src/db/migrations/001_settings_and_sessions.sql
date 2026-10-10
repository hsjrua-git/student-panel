-- Core plumbing for the single-user prototype.
--
-- This build has ONE operator, so there is no users/roles/permissions machinery
-- (that lived in the old baseline and is intentionally gone). Authentication is
-- a single password whose hash lives in `settings`. Preferences and saved views
-- are global (one operator), so neither carries a user id.

-- App-wide key/value options, including the single login password hash
-- (key 'auth.password_hash') and 'auth.initialized'. Never echo the hash.
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Operator preferences (theme, default filters, default views, ...). A single
-- row, pinned to id = 1, so the app can always UPSERT one known row.
CREATE TABLE preferences (
  id         smallint PRIMARY KEY DEFAULT 1,
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preferences_single_row CHECK (id = 1)
);
INSERT INTO preferences (id) VALUES (1);

-- Saved filter/view configurations on the results & dashboard screens. Global
-- (no per-user ownership in the single-operator build).
CREATE TABLE saved_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  config     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_view_name_length
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX saved_views_name_unique ON saved_views (lower(name));

-- Login session store for express-session + connect-pg-simple. Managed by the
-- session middleware; not edited by hand.
CREATE TABLE user_sessions (
  sid    varchar PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
