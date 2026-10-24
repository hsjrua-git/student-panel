-- =====================================================================
-- Student evaluation schema, version 4: PostgreSQL 15+
-- Run with:  psql -d your_database -v ON_ERROR_STOP=1 -f schema-4.sql
--
-- Changes from schema-3:
--  * periods: only active sessions count (not archived, not canceled);
--    inactive sessions leave their period, active restores rejoin
--  * alerts: no archived_at (delete instead); one OPEN alert per kind/session,
--    so a resolved alert can be raised again; resolution waits for all required
--    parameters; a cleanup pass closes the daily-job race
--  * evaluation rows are the selected cells: an empty row is a pending
--    requirement, and filling it answers that cell; session_is_complete() uses
--    this directly (no separate requirement table)
--  * evaluation: comment-only allowed; min/max enforced; no whole-group score
--    on an individual assignment; membership dates checked; archived or canceled
--    sessions cannot be evaluated; canceling is blocked while a score is active
--  * membership and task no longer carry archived_at: membership dates already
--    describe leaving, and a task can be deleted with the audit log keeping history
--  * assignment.name added; blank assignment codes are auto-generated;
--    assignment-code changes never cascade
--  * task_template catalog + task.template_id; one template can be assigned to
--    many sessions, but each task is a snapshot that can be edited independently
--  * secret table for password hashes / app-encrypted values; setting is for
--    non-secret configuration only
--  * audit helper handles tables without archived_at
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Enum types
-- ---------------------------------------------------------------------
create type gender_type  as enum ('male', 'female');
create type audit_action as enum ('insert', 'update', 'archive', 'restore', 'delete', 'lock', 'unlock');
create type alert_kind   as enum ('session_incomplete');
-- more alert kinds later:  alter type alert_kind add value 'something_else';

-- ---------------------------------------------------------------------
-- 2. Tables (parents first, so every foreign key points at a table that exists)
-- ---------------------------------------------------------------------

create table student (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null,
  full_name   text        not null,
  gender      gender_type not null,
  birth_date  date        not null,
  father_name text        not null,
  national_id text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create unique index s_c_u on student (code);
create unique index s_n_u on student (national_id);

create table student_group (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null,
  name        text        not null,
  parent_id   uuid        constraint student_group_parent_fk references student_group (id),
  sort_order  integer     not null default 0,  -- order among siblings in the tree
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint student_group_sort_ck check (sort_order >= 0)
);
create unique index g_c_u on student_group (code);
create index        g_p_i on student_group (parent_id);

create table membership (
  id          uuid        primary key default gen_random_uuid(),
  student_id  uuid        not null constraint membership_student_fk references student (id),
  group_id    uuid        not null constraint membership_group_fk   references student_group (id),
  joined_on   date        not null,
  left_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint membership_dates_ck check (left_on is null or left_on >= joined_on)
);
create unique index m_sgj_u on membership (student_id, group_id, joined_on);
create index        m_g_i   on membership (group_id);

create table teacher (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null,
  full_name   text        not null,
  birth_date  date        not null,
  national_id text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create unique index t_c_u on teacher (code);
create unique index t_n_u on teacher (national_id);

create table parameter (
  id          uuid        primary key default gen_random_uuid(),
  parent_id   uuid        constraint parameter_parent_fk references parameter (id),
  name        text        not null,
  min_value   integer,                         -- optional
  max_value   integer,                         -- optional
  sort_order  integer     not null default 0,  -- column order in scores and reports
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint parameter_range_ck check (min_value <= max_value),  -- passes when either one is empty
  constraint parameter_sort_ck  check (sort_order >= 0)
);
create unique index p_n_u on parameter (name);
create index        p_p_i on parameter (parent_id);

-- The default interval between the sessions of an assignment.
-- Note: "interval" is also the name of a PostgreSQL data type. As a table name it is allowed,
-- but if Postgres ever complains, write it in double quotes: "interval".
create table interval (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  every       interval    not null,           -- e.g. '7 days', '1 month', '3 days'
  sort_order  integer     not null default 0, -- order in the rhythm picker
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint interval_positive_ck check (every > interval '0'),
  constraint interval_sort_ck     check (sort_order >= 0)
);
create unique index iv_n_u on interval (name);

create table assignment (
  id            uuid        primary key default gen_random_uuid(),
  code          text        not null,         -- short unique code; session codes start with it
  name          text,                         -- editable display name; the code never changes after sessions
  teacher_id    uuid        not null constraint assignment_teacher_fk    references teacher (id),
  interval_id   uuid        not null constraint assignment_interval_fk   references interval (id),
  group_id      uuid        constraint assignment_group_fk               references student_group (id),  -- whole group
  membership_id uuid        constraint assignment_membership_fk          references membership (id),     -- or one member
  anchor_date   date        not null,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  -- Exactly one of group_id / membership_id must be filled.
  constraint assignment_target_ck check (num_nonnulls(group_id, membership_id) = 1),
  constraint assignment_code_ck   check (char_length(btrim(code)) between 1 and 40),
  constraint assignment_name_ck   check (name is null or char_length(btrim(name)) between 1 and 120),
  constraint assignment_sort_ck   check (sort_order >= 0)
);
create unique index a_c_u on assignment (code);
create index        a_g_i on assignment (group_id);
create index        a_m_i on assignment (membership_id);
create index        a_i_i on assignment (interval_id);
-- One assignment per teacher/interval/target. Partial indexes because NULLs count as distinct.
create unique index assignment_group_u  on assignment (teacher_id, interval_id, group_id)
  where group_id is not null;
create unique index assignment_member_u on assignment (teacher_id, interval_id, membership_id)
  where membership_id is not null;

-- Every four evaluated sessions of an assignment (a group or a student) form one period.
create table period (
  id            uuid        primary key default gen_random_uuid(),
  assignment_id uuid        not null constraint period_assignment_fk references assignment (id),
  seq           integer     not null,         -- 1, 2, 3... inside the assignment
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create unique index pr_as_u on period (assignment_id, seq);

create table session (
  id            uuid        primary key default gen_random_uuid(),
  assignment_id uuid        not null constraint session_assignment_fk references assignment (id),
  seq           integer     not null,         -- 1, 2, 3... inside the assignment (filled by a trigger)
  code          text        not null,         -- '<assignment code>-001', '-002'... (filled by a trigger)
  planned_date  date        not null,         -- anchor_date + n * interval.every; never edited
  moved_to      date,                         -- optional: the session was moved to this date
  session_date  date generated always as (coalesce(moved_to, planned_date)) stored,
  canceled_at   timestamptz,                  -- set = canceled; not canceled + not evaluated = not attended
  note          text,                         -- optional reason for a move or a cancellation
  period_id     uuid        constraint session_period_fk references period (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create unique index se_c_u  on session (code);
create unique index se_as_u on session (assignment_id, planned_date);
create unique index se_aq_u on session (assignment_id, seq);
create index        se_d_i  on session (session_date);
create index        se_p_i  on session (period_id);

-- One row = one selected evaluation cell. A row may be created before any
-- value is entered: empty values plus an empty comment mean "selected, not
-- answered yet". That row is itself the requirement. An empty membership_id
-- means the whole group; a non-empty one means that member. On an individual
-- assignment, the member must be the assignment's own member.
create table evaluation (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null constraint evaluation_session_fk   references session (id),
  parameter_id   uuid        not null constraint evaluation_parameter_fk references parameter (id),
  membership_id  uuid        constraint evaluation_membership_fk         references membership (id),  -- null = whole group
  quality_value  integer,
  quantity_value integer,
  comment        text,                        -- one note for the whole score row
  locked_at      timestamptz,                 -- null = open; set = changes need an override reason
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz,
  -- Empty values are allowed: that is a selected cell that has not been
  -- answered yet. A row answers the cell when at least one value is present,
  -- or the comment has non-whitespace text. Comment-only is allowed.
  constraint evaluation_comment_ck check (comment is null or char_length(comment) <= 500)
);
create index e_p_i on evaluation (parameter_id);
create index e_m_i on evaluation (membership_id);
-- One evaluation per session/parameter/target. NULL membership_id = whole group.
create unique index evaluation_u on evaluation (session_id, parameter_id, membership_id)
  nulls not distinct;

-- A reusable task definition. Assigning it copies (snapshots) the values into
-- one task row per session; later template edits never change those rows.
create table task_template (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  description   text,
  parameter_id  uuid        constraint task_template_parameter_fk references parameter (id),
  extra         jsonb       not null default '{}'::jsonb,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint task_template_title_length       check (char_length(btrim(title)) between 1 and 120),
  constraint task_template_description_length check (description is null or char_length(description) <= 2000),
  constraint task_template_extra_ck           check (jsonb_typeof(extra) = 'object'),
  constraint task_template_sort_ck            check (sort_order >= 0)
);
create index tt_p_i  on task_template (parameter_id);
create index tt_s_i  on task_template (sort_order);

create table task (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null constraint task_session_fk   references session (id),
  template_id   uuid        constraint task_template_fk references task_template (id) on delete set null,
  parameter_id  uuid        constraint task_parameter_fk references parameter (id),  -- optional again
  membership_id uuid        constraint task_membership_fk         references membership (id),  -- null = whole group
  title         text        not null,
  description   text,
  extra         jsonb       not null default '{}'::jsonb,
  done          boolean     not null default false,
  done_at       timestamptz,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint task_title_length       check (char_length(btrim(title)) between 1 and 120),
  constraint task_description_length check (description is null or char_length(description) <= 2000),
  constraint task_done_ck            check (done_at is null or done),
  constraint task_extra_ck           check (jsonb_typeof(extra) = 'object'),
  constraint task_sort_ck            check (sort_order >= 0)
);
create index ta_spm_i  on task (session_id, parameter_id, membership_id);
create index ta_t_i    on task (template_id);
create index ta_p_i    on task (parameter_id);
create index ta_m_i    on task (membership_id);
create index ta_sso_i  on task (session_id, sort_order);

-- Alerts are deleted, not archived. A resolved alert may be raised again; the
-- unique rule protects only OPEN alerts, so the history can contain several
-- resolved rows for the same session.
create table alert (
  id          uuid        primary key default gen_random_uuid(),
  kind        alert_kind  not null,
  session_id  uuid        constraint alert_session_fk references session (id),
  message     text,
  resolved_at timestamptz,                    -- null = still open
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index alr_s_i on alert (session_id);
create unique index alr_ks_open_u on alert (kind, session_id)
  where session_id is not null and resolved_at is null;

-- ---------------------------------------------------------------------
-- 3. App plumbing restored from the compacted project
-- ---------------------------------------------------------------------
-- These tables are deliberately NOT audited:
--   * preference is UI-only (theme, page size, ...)
--   * setting is public app configuration only. NEVER store a secret here.
--   * secret holds a password hash or an app-encrypted value. The key used to
--     encrypt/decrypt is outside the database; the database never sees plaintext.
--     Restrict this table to the application role (see schema-4-security.sql).

create table setting (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now(),
  constraint setting_key_ck check (char_length(btrim(key)) between 1 and 120)
);

create table preference (
  id         smallint    primary key default 1,
  settings   jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint preference_single_row_ck check (id = 1),
  constraint preference_object_ck    check (jsonb_typeof(settings) = 'object')
);
insert into preference (id) values (1);

-- Exactly one of the two value columns is filled:
--   password hashes go in value_hash (Argon2id/bcrypt; never plaintext);
--   API keys, SMTP passwords, etc. go in value_encrypted (app-side encryption).
create table secret (
  key             text        primary key,
  value_hash      text,
  value_encrypted bytea,
  updated_at      timestamptz not null default now(),
  constraint secret_key_ck   check (char_length(btrim(key)) between 1 and 120),
  constraint secret_value_ck check (num_nonnulls(value_hash, value_encrypted) = 1),
  constraint secret_hash_ck  check (value_hash is null or char_length(value_hash) > 0),
  constraint secret_cipher_ck check (value_encrypted is null or octet_length(value_encrypted) > 0)
);

create table audit_log (
  id          uuid         primary key default gen_random_uuid(),
  table_name  text         not null,
  record_id   uuid         not null,           -- no FK on purpose: it points at rows in any table
  action      audit_action not null,
  old_data    jsonb,                           -- row before the change (null on insert)
  new_data    jsonb,                           -- row after the change (null on delete)
  changed_by  text,                            -- from the app.user_id session setting
  reason      text,                            -- override reason for a locked evaluation
  changed_at  timestamptz  not null default now(),
  constraint audit_reason_length check (reason is null or char_length(reason) <= 500)
);
create index al_trc_i on audit_log (table_name, record_id, changed_at);
create index al_c_i   on audit_log (changed_at);

-- ---------------------------------------------------------------------
-- 4. Basic triggers: updated_at and the audit log
-- ---------------------------------------------------------------------

-- Keep updated_at current.
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Record every change in audit_log. The app sets the user once per transaction:
--   select set_config('app.user_id', '<teacher or admin id>', true);
-- For a change to a locked evaluation, the app sets the written reason:
--   select set_config('app.override_reason', '<the reason>', true);
create function audit_row() returns trigger
language plpgsql as $$
declare
  act      audit_action;
  rid      uuid;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    act := 'insert';  rid := new.id;
  elsif tg_op = 'DELETE' then
    act := 'delete';  rid := old.id;
  else
    rid := new.id;
    -- Use JSON extraction so the same trigger works on tables without archived_at.
    if (to_jsonb(old) ->> 'archived_at') is null
       and (to_jsonb(new) ->> 'archived_at') is not null then
      act := 'archive';
    elsif (to_jsonb(old) ->> 'archived_at') is not null
          and (to_jsonb(new) ->> 'archived_at') is null then
      act := 'restore';
    elsif tg_table_name = 'evaluation'
          and (to_jsonb(old) ->> 'locked_at') is null
          and (to_jsonb(new) ->> 'locked_at') is not null then
      act := 'lock';
    elsif tg_table_name = 'evaluation'
          and (to_jsonb(old) ->> 'locked_at') is not null
          and (to_jsonb(new) ->> 'locked_at') is null then
      act := 'unlock';
    else
      act := 'update';
    end if;

    if tg_table_name = 'evaluation' and (to_jsonb(old) ->> 'locked_at') is not null then
      v_reason := nullif(btrim(coalesce(current_setting('app.override_reason', true), '')), '');
    end if;
  end if;

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by, reason)
  values (tg_table_name, rid, act,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          current_setting('app.user_id', true),
          v_reason);
  return null;
end $$;

-- Attach both triggers to each audited working table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'student', 'student_group', 'membership', 'teacher', 'parameter', 'interval',
    'assignment', 'period', 'session', 'evaluation',
    'task_template', 'task', 'alert'
  ]
  loop
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_updated', t);
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function audit_row()',
      t || '_audit', t);
  end loop;
end $$;

-- setting and preference keep updated_at current, but are not audited.
create trigger setting_updated
  before update on setting
  for each row execute function set_updated_at();

create trigger preference_updated
  before update on preference
  for each row execute function set_updated_at();

-- Secrets are not audited, but their timestamp is maintained.
create trigger secret_updated
  before update on secret
  for each row execute function set_updated_at();

-- audit_log is append-only: block UPDATE and DELETE.
create function audit_log_block() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_no_change
  before update or delete on audit_log
  for each row execute function audit_log_block();

-- ---------------------------------------------------------------------
-- 5. Rules that look at other rows
-- ---------------------------------------------------------------------

-- evaluation.membership_id / task.membership_id:
--   group assignment      -> NULL means the whole group; a member must be in
--                            that group AND active on the session date.
--   individual assignment -> the member must be the assignment's own member
--                            AND active on the session date. A whole-group
--                            score is impossible (but a session-level task may
--                            still have NULL membership).
create function check_membership_in_assignment() returns trigger
language plpgsql as $$
declare
  v_assignment  record;
  v_membership membership%rowtype;
  v_date        date;
begin
  select a.id, a.group_id, a.membership_id, s.session_date
    into v_assignment
    from session s
    join assignment a on a.id = s.assignment_id
   where s.id = new.session_id;

  if not found then
    raise exception 'session % does not exist', new.session_id
      using errcode = 'foreign_key_violation';
  end if;

  v_date := v_assignment.session_date;

  if v_assignment.group_id is not null then
    if new.membership_id is null then
      return new;                              -- whole-group row
    end if;

    select * into v_membership
      from membership
     where id = new.membership_id
       and group_id = v_assignment.group_id;

    if not found then
      raise exception 'membership % does not belong to the assignment of session %',
        new.membership_id, new.session_id
        using errcode = 'check_violation';
    end if;
  else
    if new.membership_id is null then
      -- A task can be a session-level task; an evaluation cannot be a
      -- whole-group score on a one-member assignment.
      if tg_table_name = 'task' then
        return new;
      end if;
      raise exception 'individual assignment session % requires a member target',
        new.session_id
        using errcode = 'check_violation';
    end if;

    if new.membership_id <> v_assignment.membership_id then
      raise exception 'membership % is not the member of the assignment of session %',
        new.membership_id, new.session_id
        using errcode = 'check_violation';
    end if;

    select * into v_membership
      from membership
     where id = new.membership_id;
  end if;

  if v_date < v_membership.joined_on
     or (v_membership.left_on is not null and v_date > v_membership.left_on) then
    raise exception 'membership % was not active on session date %',
      new.membership_id, v_date
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger evaluation_membership_ck
  before insert or update of session_id, membership_id on evaluation
  for each row execute function check_membership_in_assignment();

create trigger task_membership_ck
  before insert or update of session_id, membership_id on task
  for each row execute function check_membership_in_assignment();

-- Create one task from a template. Values are copied, not linked: editing the
-- template later never changes the created task.
create function create_task_from_template(
  p_template    uuid,
  p_session     uuid,
  p_membership  uuid default null
) returns uuid
language plpgsql as $$
declare
  t       task_template%rowtype;
  v_task  uuid;
begin
  select * into t
    from task_template
   where id = p_template and archived_at is null;

  if not found then
    raise exception 'task template % does not exist or is archived', p_template
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from session
     where id = p_session
       and (archived_at is not null or canceled_at is not null)
  ) then
    raise exception 'session % is archived or canceled', p_session
      using errcode = 'check_violation';
  end if;

  if t.parameter_id is not null
     and exists (select 1 from parameter where id = t.parameter_id and archived_at is not null) then
    raise exception 'parameter % of task template % is archived', t.parameter_id, p_template
      using errcode = 'check_violation';
  end if;

  insert into task (
    session_id, template_id, parameter_id, membership_id,
    title, description, extra, sort_order
  ) values (
    p_session, p_template, t.parameter_id, p_membership,
    t.title, t.description, t.extra, t.sort_order
  )
  returning id into v_task;

  return v_task;
end $$;

-- Assign one template to many sessions in one call. Each session gets its own
-- editable snapshot. Duplicate session ids are ignored.
create function assign_task_template(
  p_template   uuid,
  p_sessions   uuid[],
  p_membership uuid default null
) returns integer
language plpgsql as $$
declare
  v_session uuid;
  v_count   integer := 0;
begin
  for v_session in select distinct x from unnest(p_sessions) as t(x) loop
    perform create_task_from_template(p_template, v_session, p_membership);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- A canceled session cannot receive or keep an active evaluation. Archiving an
-- evaluation is allowed; restoring one is not.
create function check_session_not_canceled() returns trigger
language plpgsql as $$
begin
  if new.archived_at is null
     and exists (select 1 from session where id = new.session_id and canceled_at is not null) then
    raise exception 'session % is canceled and cannot be evaluated', new.session_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger evaluation_not_canceled_ck
  before insert or update of session_id, archived_at on evaluation
  for each row execute function check_session_not_canceled();

-- A session with any active evaluation row cannot be canceled, even if that row
-- is only a selected but unanswered cell. Archive/delete those cells first if the
-- session truly did not happen; archived rows remain history.
create function session_cancel_guard() returns trigger
language plpgsql as $$
begin
  if new.canceled_at is not null and old.canceled_at is null
     and exists (
       select 1 from evaluation
        where session_id = old.id and archived_at is null
     ) then
    raise exception 'session % has an active evaluation; archive it before canceling',
      old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger session_cancel_ck
  before update of canceled_at on session
  for each row execute function session_cancel_guard();

-- A locked evaluation cannot change without a written override reason.
-- Locking and unlocking themselves are allowed, and archiving/restoring is allowed.
create function evaluation_lock_guard() returns trigger
language plpgsql as $$
declare
  v_reason text;
begin
  if old.locked_at is not null and (
       new.session_id     is distinct from old.session_id
    or new.parameter_id   is distinct from old.parameter_id
    or new.membership_id  is distinct from old.membership_id
    or new.quality_value  is distinct from old.quality_value
    or new.quantity_value is distinct from old.quantity_value
    or new.comment        is distinct from old.comment
  ) then
    v_reason := nullif(btrim(coalesce(current_setting('app.override_reason', true), '')), '');
    if v_reason is null then
      raise exception 'evaluation % is locked; set app.override_reason to change it', new.id
        using errcode = 'check_violation';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'the override reason is too long (max 500 characters)'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger evaluation_lock_ck
  before update on evaluation
  for each row execute function evaluation_lock_guard();

-- An archived evaluation is history. It cannot be edited unless it is restored
-- to active in the same statement (and then the active-reference check applies).
-- This closes the gap where updating only quality/quantity/comment would bypass
-- a trigger that watched only the reference columns.
create function evaluation_edit_guard() returns trigger
language plpgsql as $$
declare
  v_changed boolean;
begin
  v_changed := (to_jsonb(new) - 'updated_at' - 'archived_at')
            is distinct from
               (to_jsonb(old) - 'updated_at' - 'archived_at');

  if not v_changed then
    return new;
  end if;

  if old.archived_at is not null and new.archived_at is not null then
    raise exception 'archived evaluation % cannot be changed; restore it first', old.id
      using errcode = 'check_violation';
  end if;

  -- Editing and archiving in one statement is not allowed. Archive first, or
  -- restore and edit, so the active/reference rules are always clear.
  if new.archived_at is not null then
    raise exception 'evaluation % cannot be changed while it is archived', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger evaluation_edit_ck
  before update on evaluation
  for each row execute function evaluation_edit_guard();

-- An active row may not point at an archived session, assignment, or parameter.
-- The trigger runs on every evaluation update, not only reference changes, so
-- editing quality/quantity/comment cannot bypass the check. Archiving the row
-- itself is always allowed; restoring it is not allowed while a referenced row
-- is archived.
create function check_active_references() returns trigger
language plpgsql as $$
declare
  v_assignment_id uuid;
begin
  if tg_table_name = 'evaluation'
     and (to_jsonb(new) ->> 'archived_at') is not null then
    return new;                                -- archiving is allowed
  end if;

  select s.assignment_id into v_assignment_id
    from session s
   where s.id = new.session_id;

  if exists (
    select 1 from session
     where id = new.session_id
       and (archived_at is not null or canceled_at is not null)
  ) then
    raise exception 'session % is archived or canceled and cannot be used', new.session_id
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from assignment where id = v_assignment_id and archived_at is not null) then
    raise exception 'assignment % is archived and cannot be used', v_assignment_id
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from parameter where id = new.parameter_id and archived_at is not null) then
    raise exception 'parameter % is archived and cannot be used', new.parameter_id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger evaluation_active_refs_ck
  before insert or update on evaluation
  for each row execute function check_active_references();

-- Quality and quantity must stay inside the parameter's range. A NULL bound
-- means "no limit on that side".
create function check_parameter_range() returns trigger
language plpgsql as $$
declare
  v_min integer;
  v_max integer;
begin
  select min_value, max_value into v_min, v_max
    from parameter where id = new.parameter_id;

  if new.quality_value is not null
     and ((v_min is not null and new.quality_value < v_min)
          or (v_max is not null and new.quality_value > v_max)) then
    raise exception 'quality value % is outside parameter % range [%, %]',
      new.quality_value, new.parameter_id, coalesce(v_min::text, '-inf'), coalesce(v_max::text, '+inf')
      using errcode = 'check_violation';
  end if;

  if new.quantity_value is not null
     and ((v_min is not null and new.quantity_value < v_min)
          or (v_max is not null and new.quantity_value > v_max)) then
    raise exception 'quantity value % is outside parameter % range [%, %]',
      new.quantity_value, new.parameter_id, coalesce(v_min::text, '-inf'), coalesce(v_max::text, '+inf')
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger evaluation_range_ck
  before insert or update of parameter_id, quality_value, quantity_value on evaluation
  for each row execute function check_parameter_range();

-- Narrowing a parameter range must not invalidate existing active answers.
create function check_parameter_range_change() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from evaluation e
     where e.parameter_id = new.id
       and e.archived_at is null
       and (
         (e.quality_value is not null
          and ((new.min_value is not null and e.quality_value < new.min_value)
               or (new.max_value is not null and e.quality_value > new.max_value)))
         or
         (e.quantity_value is not null
          and ((new.min_value is not null and e.quantity_value < new.min_value)
               or (new.max_value is not null and e.quantity_value > new.max_value)))
       )
  ) then
    raise exception 'parameter % has evaluations outside the new range', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger parameter_range_change_ck
  before update of min_value, max_value on parameter
  for each row execute function check_parameter_range_change();

-- ---------------------------------------------------------------------
-- 6. Session identity: assignment code + 3-digit sequence, globally unique
-- ---------------------------------------------------------------------
create function session_set_code() returns trigger
language plpgsql as $$
declare
  v_code text;
begin
  -- one session at a time per assignment, so two sessions never get the same number
  perform 1 from assignment where id = new.assignment_id for no key update;

  select code into v_code from assignment where id = new.assignment_id;
  if v_code is null then
    raise exception 'assignment % does not exist', new.assignment_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.seq is null then
    new.seq := (select coalesce(max(seq), 0) + 1 from session where assignment_id = new.assignment_id);
  end if;

  -- The assignment code is unique, and seq is unique inside the assignment.
  -- Putting them together therefore makes session.code unique across the database.
  new.code := v_code || '-' ||
    case when new.seq < 1000 then lpad(new.seq::text, 3, '0') else new.seq::text end;
  return new;
end $$;

create trigger session_code_seq
  before insert on session
  for each row execute function session_set_code();

-- A session's identity may not be rewritten after it exists.
create function session_identity_guard() returns trigger
language plpgsql as $$
begin
  if new.assignment_id is distinct from old.assignment_id then
    raise exception 'session.assignment_id cannot be changed' using errcode = 'check_violation';
  end if;
  if new.seq is distinct from old.seq then
    raise exception 'session.seq is generated and cannot be changed' using errcode = 'check_violation';
  end if;
  if new.code is distinct from old.code then
    raise exception 'session.code is generated and cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger session_identity_ck
  before update on session
  for each row execute function session_identity_guard();

-- An assignment code may change only while no session uses it.
create function assignment_code_guard() returns trigger
language plpgsql as $$
begin
  if new.code is distinct from old.code
     and exists (select 1 from session where assignment_id = new.id) then
    raise exception 'assignment.code cannot change after sessions exist'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger assignment_code_ck
  before update of code on assignment
  for each row execute function assignment_code_guard();

-- Turn arbitrary text into a short uppercase code fragment.
create function slug_code(p_text text) returns text
language sql immutable as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(upper(coalesce(p_text, '')), '[^A-Z0-9]+', '-', 'g')),
      ''
    ),
    'ASSIGNMENT'
  )
$$;

-- Suggest a target-rich assignment code. This is used when an insert leaves
-- the code empty. A supplied code is never overwritten.
create function generate_assignment_code(
  p_teacher    uuid,
  p_interval   uuid,
  p_group      uuid,
  p_membership uuid
) returns text
language plpgsql as $$
declare
  v_teacher  text;
  v_interval text;
  v_target   text;
  v_base     text;
  v_try      text;
  v_n        integer := 1;
  v_suffix   text;
begin
  select code into v_teacher from teacher where id = p_teacher;
  select name into v_interval from interval where id = p_interval;

  if p_group is not null then
    select code into v_target from student_group where id = p_group;
  else
    select st.code into v_target
      from membership m
      join student st on st.id = m.student_id
     where m.id = p_membership;
  end if;

  v_base := left(slug_code(coalesce(v_target, 'TARGET') || '-' ||
                           coalesce(v_interval, 'INTERVAL') || '-' ||
                           coalesce(v_teacher, 'TEACHER')), 40);
  v_try := v_base;

  while exists (select 1 from assignment where code = v_try) loop
    v_n := v_n + 1;
    v_suffix := '-' || v_n;
    v_try := left(v_base, 40 - char_length(v_suffix)) || v_suffix;
  end loop;

  return v_try;
end $$;

create function assignment_set_code() returns trigger
language plpgsql as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := generate_assignment_code(
      new.teacher_id, new.interval_id, new.group_id, new.membership_id);
  end if;
  return new;
end $$;

create trigger assignment_code_fill
  before insert on assignment
  for each row execute function assignment_set_code();

-- ---------------------------------------------------------------------
-- 7. Periods: every four evaluated sessions of an assignment
-- ---------------------------------------------------------------------

-- The number of evaluated sessions in one period. Change it here only.
create function period_size() returns integer
language sql immutable as $$ select 4 $$;

-- Put a session into the newest period that still has room (or start a new one).
-- Only active sessions count: archived and canceled sessions are ignored.
create function attach_session_to_period(p_session uuid) returns void
language plpgsql as $$
declare
  v_assignment uuid;
  v_period     uuid;
  v_archived   timestamptz;
  v_canceled   timestamptz;
begin
  select assignment_id, period_id, archived_at, canceled_at
    into v_assignment, v_period, v_archived, v_canceled
    from session where id = p_session for update;

  if v_period is not null then
    return;                                    -- already in a period
  end if;

  if v_archived is not null or v_canceled is not null then
    return;                                    -- an inactive session does not occupy a slot
  end if;

  -- one at a time per assignment
  perform 1 from assignment where id = v_assignment for no key update;

  select p.id into v_period
    from period p
   where p.assignment_id = v_assignment
     and p.archived_at is null
     and (select count(*)
            from session x
           where x.period_id = p.id
             and x.archived_at is null
             and x.canceled_at is null) < period_size()
   order by p.seq desc
   limit 1;

  if v_period is null then
    insert into period (assignment_id, seq)
    values (v_assignment,
            (select coalesce(max(seq), 0) + 1 from period where assignment_id = v_assignment))
    returning id into v_period;
  end if;

  update session set period_id = v_period where id = p_session;
end $$;

-- Archiving or canceling a session removes it from its period. Restoring or
-- un-canceling re-attaches it only if it has evaluation history; otherwise it
-- will attach when it receives its first answer.
create function session_period_activity_guard() returns trigger
language plpgsql as $$
begin
  if (new.archived_at is not null or new.canceled_at is not null)
     and old.archived_at is null and old.canceled_at is null then
    new.period_id := null;
  end if;
  return new;
end $$;

create trigger session_period_activity_ck
  before update of archived_at, canceled_at on session
  for each row execute function session_period_activity_guard();

create function evaluation_is_answered(
  p_quality integer,
  p_quantity integer,
  p_comment text
) returns boolean
language sql immutable as $$
  select p_quality is not null
      or p_quantity is not null
      or (p_comment is not null and btrim(p_comment) <> '');
$$;

create function session_period_reactivate() returns trigger
language plpgsql as $$
begin
  if new.archived_at is null and new.canceled_at is null
     and (old.archived_at is not null or old.canceled_at is not null)
     and new.period_id is null
     and exists (
       select 1 from evaluation
        where session_id = new.id
          and archived_at is null
          and evaluation_is_answered(quality_value, quantity_value, comment)
     ) then
    perform attach_session_to_period(new.id);
  end if;
  return null;
end $$;

create trigger session_period_reactivate_ck
  after update of archived_at, canceled_at on session
  for each row execute function session_period_reactivate();

-- A session is complete when it has at least one active selected cell and every
-- active selected cell is answered. A cell whose parameter is archived is
-- paused, not a permanent blocker; it counts again if the parameter is restored.
create function session_is_complete(p_session uuid) returns boolean
language sql stable as $$
  with cells as (
    select e.quality_value, e.quantity_value, e.comment
      from evaluation e
      join parameter p
        on p.id = e.parameter_id and p.archived_at is null
     where e.session_id = p_session
       and e.archived_at is null
  )
  select
    (
      exists (select 1 from cells)
      and not exists (
        select 1 from cells
         where not evaluation_is_answered(quality_value, quantity_value, comment)
      )
    )
    or
    (
      -- All selected cells are paused because their parameters are archived.
      -- If at least one of them was answered, the historical session is complete;
      -- otherwise it still has no answer.
      not exists (select 1 from cells)
      and exists (
        select 1 from evaluation
         where session_id = p_session
           and archived_at is null
           and evaluation_is_answered(quality_value, quantity_value, comment)
      )
    );
$$;

-- Serialize alert work per session. Both the daily job and the evaluation
-- trigger take the same transaction-scoped advisory lock, so a score cannot
-- commit between "insert alert" and "cleanup" without one side seeing the other.
create function resolve_session_alerts(p_session uuid) returns void
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session::text, 0));
  update alert
     set resolved_at = now()
   where session_id = p_session
     and kind = 'session_incomplete'
     and resolved_at is null
     and session_is_complete(p_session);
end $$;

-- A session occupies a period only while it has at least one answered active
-- evaluation. An empty selected cell is a pending requirement, not a score.
create function detach_session_if_unscored(p_session uuid) returns void
language plpgsql as $$
begin
  update session s
     set period_id = null
   where s.id = p_session
     and s.period_id is not null
     and not exists (
       select 1
         from evaluation e
        where e.session_id = p_session
          and e.archived_at is null
          and evaluation_is_answered(e.quality_value, e.quantity_value, e.comment)
     );
end $$;

-- After an evaluation change: attach on the first answer, detach when the last
-- answer disappears, and resolve an alert only when every selected cell has an
-- answer. An empty evaluation row is a pending cell, so it does not attach the
-- session to a period by itself.
create function evaluation_after_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.archived_at is null
       and evaluation_is_answered(new.quality_value, new.quantity_value, new.comment) then
      perform attach_session_to_period(new.session_id);
    end if;
    perform resolve_session_alerts(new.session_id);
  elsif tg_op = 'UPDATE' then
    if new.archived_at is null
       and evaluation_is_answered(new.quality_value, new.quantity_value, new.comment) then
      perform attach_session_to_period(new.session_id);
    end if;

    perform detach_session_if_unscored(new.session_id);

    if new.session_id is distinct from old.session_id then
      perform detach_session_if_unscored(old.session_id);
      perform resolve_session_alerts(old.session_id);
    end if;

    perform resolve_session_alerts(new.session_id);
  else
    perform detach_session_if_unscored(old.session_id);
    perform resolve_session_alerts(old.session_id);
  end if;

  return null;
end $$;

create trigger evaluation_alert_period
  after insert or update or delete on evaluation
  for each row execute function evaluation_after_change();

-- ---------------------------------------------------------------------
-- 8. Creating sessions and raising alerts (run these on a schedule, e.g. daily)
-- ---------------------------------------------------------------------

-- Create every missing session up to p_until (default: today) for all active assignments,
-- or only for one assignment. The date of session n is anchor_date + n * interval.every.
-- Safe to run again and again: existing sessions are skipped. Returns how many were created.
create function generate_sessions(p_until date default current_date, p_assignment uuid default null)
returns integer
language plpgsql as $$
declare
  a       record;
  n       integer;
  d       date;
  v_rows  integer;
  total   integer := 0;
begin
  for a in
    select asg.id, asg.anchor_date, i.every
      from assignment asg
      join interval i on i.id = asg.interval_id
     where asg.archived_at is null
       and (p_assignment is null or asg.id = p_assignment)
  loop
    n := 0;
    loop
      d := (a.anchor_date + n * a.every)::date;
      exit when d > p_until;

      insert into session (assignment_id, planned_date)
      values (a.id, d)
      on conflict (assignment_id, planned_date) do nothing;

      get diagnostics v_rows = row_count;
      total := total + v_rows;
      n := n + 1;
    end loop;
  end loop;
  return total;
end $$;

-- Raise an alert for every active session that is not complete and whose date
-- passed more than p_grace ago. Only one OPEN alert per kind/session is allowed;
-- a resolved alert can be raised again later (B). The final loop is the
-- cleanup pass (I): it closes alerts for sessions that became complete while
-- the daily job was running.
create function raise_overdue_alerts(p_grace interval default interval '1 day')
returns integer
language plpgsql as $$
declare
  n          integer := 0;
  v_inserted integer;
  v_session  record;
  v_alert    record;
begin
  -- One session at a time, in id order, with the same advisory lock used by
  -- the evaluation trigger. Re-check completeness after taking the lock.
  for v_session in
    select s.id
      from session s
     where s.archived_at is null
       and s.canceled_at is null
       and s.session_date + p_grace < localtimestamp
       and not session_is_complete(s.id)
     order by s.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_session.id::text, 0));

    if not session_is_complete(v_session.id) then
      insert into alert (kind, session_id, message)
      values (
        'session_incomplete',
        v_session.id,
        'Session ' || (select code from session where id = v_session.id) ||
        ' (' || (select session_date from session where id = v_session.id) ||
        ') is missing required evaluations'
      )
      on conflict do nothing;

      get diagnostics v_inserted = row_count;
      n := n + v_inserted;
    end if;
  end loop;

  -- Cleanup pass (I): close alerts for sessions that became complete while the
  -- job was running. Ordered locks avoid deadlocks between two daily runs.
  for v_alert in
    select distinct a.session_id
      from alert a
     where a.kind = 'session_incomplete'
       and a.resolved_at is null
       and a.session_id is not null
     order by a.session_id
  loop
    perform resolve_session_alerts(v_alert.session_id);
  end loop;

  return n;
end $$;

-- ---------------------------------------------------------------------
-- 9. Views
-- ---------------------------------------------------------------------

-- What happened to each session:
--   canceled  = did not happen
--   complete  = at least one active selected cell, and all selected cells answered
--   partial   = at least one answer exists, but a selected cell is unanswered
--   upcoming  = today or later, no answer yet
--   not_attended = past, no answer yet, not canceled
create view session_status as
select s.id as session_id,
       s.assignment_id,
       s.code,
       s.session_date,
       case
         when s.canceled_at is not null then 'canceled'
         when session_is_complete(s.id) then 'complete'
         when exists (select 1 from evaluation e
                       where e.session_id = s.id
                         and e.archived_at is null
                         and evaluation_is_answered(e.quality_value, e.quantity_value, e.comment)) then 'partial'
         when s.session_date >= current_date then 'upcoming'
         else 'not_attended'
       end as status
  from session s
 where s.archived_at is null;

-- Each active period with its active sessions and dates. Archived and canceled
-- sessions no longer occupy a slot (option C).
create view period_summary as
select p.id as period_id,
       p.assignment_id,
       p.seq,
       count(s.id)                      as sessions_count,
       count(s.id) >= period_size()     as is_complete,
       min(s.session_date)              as started_on,
       max(s.session_date)              as ended_on
  from period p
  left join session s
    on s.period_id = p.id
   and s.archived_at is null
   and s.canceled_at is null
 where p.archived_at is null
 group by p.id, p.assignment_id, p.seq;

-- Required cells that are still missing. Useful for an alert screen.
create view session_missing_parameters as
select e.session_id,
       e.parameter_id,
       e.membership_id
  from evaluation e
  join session s on s.id = e.session_id
  join parameter p
    on p.id = e.parameter_id and p.archived_at is null
 where s.archived_at is null
   and s.canceled_at is null
   and e.archived_at is null
   and not evaluation_is_answered(e.quality_value, e.quantity_value, e.comment);

-- The default analysis: average quality and quantity per period, parameter and target
-- (membership_id is empty for whole-group evaluations). Archived periods,
-- archived sessions, canceled sessions, and archived evaluations are excluded.
create view period_analysis as
select s.period_id,
       s.assignment_id,
       e.parameter_id,
       e.membership_id,
       count(distinct e.session_id)      as sessions_evaluated,
       round(avg(e.quality_value), 2)    as avg_quality,
       round(avg(e.quantity_value), 2)   as avg_quantity
  from evaluation e
  join session s on s.id = e.session_id
  join period p on p.id = s.period_id and p.archived_at is null
 where e.archived_at is null
   and evaluation_is_answered(e.quality_value, e.quantity_value, e.comment)
   and s.archived_at is null
   and s.canceled_at is null
   and s.period_id is not null
 group by s.period_id, s.assignment_id, e.parameter_id, e.membership_id;

commit;

-- ---------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------
-- Run daily, for example with cron (the real database name instead of "evaluation"):
--   0 6 * * *  psql -d evaluation -c "select generate_sessions(); select raise_overdue_alerts();"
--
-- Selected evaluation cells:
--   insert into evaluation (session_id, parameter_id, membership_id)
--   values (<session>, <parameter>, null);          -- select a whole-group cell
--   insert into evaluation (session_id, parameter_id, membership_id)
--   values (<session>, <parameter>, <membership>);  -- select one member's cell
--   An empty row (no quality, no quantity, no comment) is selected but not
--   answered. Update that same row to fill it. A session is complete when it
--   has at least one active selected cell and every selected cell is answered.
--   The daily alert job and session_status both use session_is_complete().
--
-- Task templates:
--   select create_task_from_template(<template>, <session>);              -- one task
--   select create_task_from_template(<template>, <session>, <member>);    -- one member
--   select assign_task_template(<template>, ARRAY[<session>, ...]::uuid[]);
--   Each task is a snapshot. Editing the template later changes nothing.
--
-- Locking a score:
--   select set_config('app.user_id', '<who>', true);
--   select set_config('app.override_reason', '<why>', true);  -- only when changing a locked row
--   update evaluation set quality_value = ... where id = ...;
--
-- Archiving = set archived_at = now() instead of deleting. Unique indexes still
-- apply to archived rows, so an archived assignment code or evaluation cell stays
-- reserved. To correct a score, restore the archived row (or update it) instead
-- of inserting a duplicate. Alerts, membership, and task have no archived_at:
-- delete them and the audit_log keeps the history.
--
-- Canceling a session is allowed only when it has no active evaluation row,
-- including pending selected cells. Archive/delete them first if the session
-- truly did not happen; an archived evaluation can be restored after un-canceling.
-- Archived/canceled sessions are removed from their period, so they do not occupy
-- one of the four active slots.
--
-- Security: setting is public configuration only. secret holds password hashes
-- or app-encrypted values; it is not audited. Run schema-4-security.sql with
-- real role names/passwords, keep TLS and encrypted backups on, and never expose
-- the app role as a superuser.
