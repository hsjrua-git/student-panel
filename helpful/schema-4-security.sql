-- =====================================================================
-- schema-4-security.sql — deployment template, NOT part of schema-4.sql
-- =====================================================================
-- Run once as a PostgreSQL superuser, after schema-4.sql, replacing the
-- placeholder passwords. Example:
--
--   psql -d evaluation \
--        -v app_password='use-a-long-random-password' \
--        -v readonly_password='another-long-random-password' \
--        -v dbname='evaluation' \
--        -f schema-4-security.sql
--
-- This file creates two login roles:
--   evaluation_app       read/write application role (never a superuser)
--   evaluation_readonly  read-only reporting role (no secret table access)
--
-- It assumes the schema objects are owned by a separate migration/owner role.
-- If the roles already exist, change these CREATE ROLE statements to ALTER ROLE
-- (and rotate the passwords) instead of re-running them.
-- =====================================================================

\set ON_ERROR_STOP on

create role evaluation_app      login password :'app_password';
create role evaluation_readonly login password :'readonly_password';

-- The public schema should not be writable by every login.
revoke all on schema public from public;
grant usage on schema public to evaluation_app, evaluation_readonly;

-- Application role: normal DML on the working tables and views.
grant select, insert, update, delete on all tables in schema public to evaluation_app;

-- Read-only role: SELECT on normal tables/views, but never the secret table.
grant select on all tables in schema public to evaluation_readonly;
revoke all on secret from evaluation_readonly;

-- The audit log is append-only in practice: the app may read and insert
-- (the audit trigger inserts), but may not update or delete history.
revoke all on audit_log from evaluation_app;
grant select, insert on audit_log to evaluation_app;

-- Secret values are app-owned. The read-only role must not see them.
revoke all on secret from public;
grant select, insert, update, delete on secret to evaluation_app;

-- Functions are invoker-rights by default; the read-only role needs EXECUTE
-- only for the functions used by the views it can select.
grant execute on all functions in schema public to evaluation_app, evaluation_readonly;
revoke execute on all functions in schema public from public;

-- UUID defaults use gen_random_uuid(); no sequences are required, but keep this
-- future-proof for any sequence-backed table added later.
grant usage, select on all sequences in schema public to evaluation_app;

-- Safer session defaults for the application role.
alter role evaluation_app set search_path = public, pg_temp;
alter role evaluation_app set statement_timeout = '30s';
alter role evaluation_app set lock_timeout = '5s';
alter role evaluation_app set idle_in_transaction_session_timeout = '60s';

-- The reporting role cannot accidentally write.
alter role evaluation_readonly set default_transaction_read_only = on;

-- Connection is only for these roles (adjust the database name if needed).
grant connect on database :"dbname" to evaluation_app, evaluation_readonly;

-- ---------------------------------------------------------------------
-- Optional hardening / next steps (do these in the deployment, not here):
-- ---------------------------------------------------------------------
-- 1. Use hostssl + scram-sha-256 in pg_hba.conf; do not expose PostgreSQL
--    directly to the internet.
-- 2. Keep the migration/owner role separate from evaluation_app. Migrations
--    run as the owner; the app never owns tables.
-- 3. Encrypt disks and backups; test restore; restrict backup access.
-- 4. Store the app's encryption key outside the database (environment/KMS/
--    secrets manager). If the key is lost, encrypted secret values cannot be
--    recovered. Rotate keys with a planned re-encryption job.
-- 5. Put app secrets in a secrets manager when possible. The secret table is
--    a fallback, not a replacement for a dedicated secrets service.
-- 6. If the app becomes multi-tenant, add row-level security policies and
--    include the tenant id in every table; table grants alone are not enough.
-- 7. Monitor failed logins, unexpected grants, audit-log growth, and long
--    transactions. Alert on changes to roles/grants.
-- 8. Never log request bodies, database errors containing secret values, or
--    the contents of secret.value_hash / value_encrypted.
-- ---------------------------------------------------------------------
