# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## Working agreement (read first)

- **Database work:** Before writing or changing any database code, inspect the
  *real* schema with the Postgres connector (list tables, describe columns,
  check indexes and constraints) — do not trust assumptions or even these docs
  for column names/types. The migrations in `server/src/db/migrations/` are the
  source of truth in the repo, but the live database is authoritative; confirm
  against it. Pull only the tables/columns you actually need.
- **Library APIs:** Before calling an unfamiliar function or configuring a
  library (Express, Helmet, express-session, react-query, react-router, Vite,
  Vitest, pg, argon2, etc.), confirm the current API with Context7 rather than
  relying on memory — several of these have had breaking changes across major
  versions (this project is on Express 5, react-router 8, react-query 5, Vite 8,
  React 19).
- **GitHub:** Use the GitHub connector for repository operations. When work is
  complete, the project should be pushed to GitHub (never commit `server/.env`
  or any real secrets — see `.gitignore`).
- **Verify your work:** run `npm run lint`, the test suites, and `npm run build`
  before considering a change done. The in-repo agents cannot always run these,
  so state clearly what was and was not verified.
- **Secrets:** never echo the contents of `server/.env` (DB password,
  `SESSION_SECRET`). Reference secrets by key name only.

## What this is

A small web app for tracking students, entering periodic scores against
configurable parameters, and reviewing results and trends. Access is controlled
by configurable roles built from fine-grained permission keys. It is designed to
run as a single Node process on a LAN (optionally behind an HTTPS reverse proxy),
with PostgreSQL for storage.

Two independently-installed packages:

- `server/` — Express 5 API, session auth, PostgreSQL access, SQL migrations.
- `client/` — React 19 + Vite single-page app.
- `deploy/` — systemd units, backup/restore scripts, an example reverse-proxy config.

## Tech stack

**Server** (`server/package.json`, ES modules, Node ≥ 20 for `--env-file`):
- `express@^5` — HTTP framework (async handlers auto-forward rejections; no
  `express-async-handler` needed).
- `express-session@^1` + `connect-pg-simple@^10` — sessions stored in Postgres
  (`user_sessions` table).
- `pg@^8` — PostgreSQL driver (a single shared pool, `src/db/pool.js`).
- `argon2@^0.45` — password hashing.
- `helmet@^8` — security headers incl. a Content-Security-Policy.
- `express-rate-limit@^8` — login throttling.
- `morgan@^1` — request logging.
- Tests: Node's built-in `node:test` (no framework dependency).

**Client** (`client/package.json`, ES modules):
- `react@^19` + `react-dom@^19`.
- `react-router@^8` — routing (note: import from `react-router`, not
  `react-router-dom`).
- `@tanstack/react-query@^5` — all server state (fetching/caching/mutations).
- `recharts@^3` — dashboard charts (lazy-loaded into a `charts` chunk).
- `papaparse@^5` — CSV parsing for the import pages.
- Build/dev: `vite@^8` (`@vitejs/plugin-react`). Tests: `vitest@^5` +
  `@testing-library/react` + `jsdom`. Lint: `eslint@^10` (flat config) with
  `react-hooks` and `react-refresh` plugins.

## Run / test / build commands

First-time setup and the full walkthrough live in `README.md`. Quick reference:

**Automated installer** (repo root): `setup.bat`/`setup.ps1` (Windows) and
`bash setup.sh` (Linux/macOS) bootstrap prerequisites and hand off to the
cross-platform orchestrator `scripts/setup.mjs` (checks Node/psql, creates the
DB + `server/.env` with generated secrets, installs deps, migrates, creates the
first admin, builds the client, starts the server, opens the browser). Re-runnable.

**Server** (run from `server/`):
- `npm install`
- `npm run migrate` — apply pending SQL migrations (transactional, tracked in
  `schema_migrations`). Run after any new migration file.
- `npm run dev` — API with `--watch` auto-reload, reads `server/.env`.
- `npm start` — production start (serves the built client if `client/dist` exists).
- `npm run create-user -- <username> "<Full Name>" [RoleName]` — make a user
  (prints a one-time temporary password).
- `npm run seed-sample` — seed sample data (dev only).
- `npm run reset-data` — dry run: show current row counts and what a reset would
  wipe. `npm run reset-data -- confirm` wipes to a fresh state (seeded roles +
  the Administrator account only; schema kept). Refuses if no active admin
  would remain.
- `npm test` — server unit tests (`node --test`). The integration suite
  (`test/permissions.test.js`) is **skipped** here unless `RUN_INTEGRATION=1`.
- `npm run test-permissions` — the integration suite (sets `RUN_INTEGRATION=1`);
  needs a running server + a throwaway DB with the seeded users.

**Client** (run from `client/`):
- `npm install`
- `npm run dev` — Vite dev server; proxies `/api` to `http://localhost:3000`.
- `npm run build` — production build to `client/dist`.
- `npm run preview` — serve the built bundle locally.
- `npm run analyze` — build with the bundle-size visualizer (`ANALYZE=1`).
- `npm run lint` — ESLint over the whole client.
- `npm test` / `npm run test:watch` — Vitest (unit + component).

**Environment:** copy `server/.env.example` → `server/.env`. Required:
`DATABASE_URL`, `SESSION_SECRET` (≥32 chars). Optional: `PORT`, `HOST`,
`NODE_ENV`, `SESSION_COOKIE_SECURE`, `TRUST_PROXY`, `CSRF_CHECK_ORIGIN` — all
documented in `.env.example`.

## Server architecture (`server/src/`)

### Entry point and middleware pipeline — `index.js`

Boots the app and wires middleware **in this order** (order matters):

1. Reads and validates config: `SESSION_SECRET` (exits if missing/<32 chars),
   `SESSION_COOKIE_SECURE` (`auto`/`true`/`false`), `TRUST_PROXY`
   (hops/bool/string; default off), `CSRF_CHECK_ORIGIN` (`auto` = on only when
   `NODE_ENV=production`).
2. `helmet(...)` with an explicit CSP (`useDefaults:false`): `scriptSrc 'self'`
   (no inline/eval), `styleSrc 'self' 'unsafe-inline'`, `imgSrc 'self' data:`,
   `connectSrc 'self'`, `object-src 'none'`, `frame-ancestors 'none'`. No
   `upgrade-insecure-requests` (would break plain-HTTP LAN).
3. `morgan`, JSON + urlencoded body parsers (1 MB limit).
4. Static serving of `client/dist` when present (`serveClient`), with a SPA
   fallback at the very end that returns `index.html` for non-API GETs.
5. `/api/health` (before session — cheap unauthenticated check).
6. `session(...)` — PG-backed store, cookie `httpOnly`, `sameSite:'lax'`,
   `secure: <configured>`, `rolling`, 8 h `maxAge`, name `sid`.
7. `attachUser` — loads the user from the session onto `req.user`.
8. CSRF: `csrf.issue` (sets the readable `csrf` cookie) + `csrf.checkOrigin`
   (Origin/Referer check, only when enforced) on all `/api`.
9. `auditRequests` — records mutating requests to the audit log.
10. `/api/auth` router (login/logout/me/change-password) — mounted **before**
    `requireLogin` and `csrf.verifyToken`, so login can work without a session
    and login/logout are guarded by the Origin check only.
11. `requireLogin` → `csrf.verifyToken` → then every feature router, each
    mounted with an `authorize({ METHOD: 'permission.key' | true })` policy.
12. `/api` 404, SPA fallback, and a global error handler that hides ≥500 detail.

### Authorization model — `middleware/auth.js` + `lib/permissions.js`

- `lib/permissions.js` defines the **fixed catalogue** of permission keys
  (`PERMISSIONS`) and their `PREREQUISITES` (e.g. `scores.override` →
  `scores.enter` → `students.view` + `parameters.view`; note `scores.enter` does
  **not** require `scores.view`, enabling a "blind entry" role).
  `withPrerequisites`/`missingPrerequisites` expand and validate chosen keys.
- Roles live in the DB (`roles` + `role_permissions`); a user points at one role.
  `lib/users.js#attachPermissions` attaches `user.permissions` (array of keys).
- `authorize(policy)` maps HTTP method → required key (or `true` = any signed-in
  user). Fail-closed: unknown method → 403; `mustChangePassword` → 403 with code
  `PASSWORD_CHANGE_REQUIRED`. `HEAD` is treated as `GET`.
- `userCan(req, key)`, `requirePermission(key)`, `requireAnyPermission(...keys)`
  cover in-router checks (e.g. role list readable by users.manage OR roles.manage).

### CSRF — `middleware/csrf.js`

`createCsrf({ secure, enforceOrigin })` returns three middlewares:
- `issue` — sets a readable (`httpOnly:false`) `csrf` cookie when absent.
- `checkOrigin` — for mutating methods, rejects when a present Origin/Referer
  host ≠ `Host`. No-op when `enforceOrigin` is false (dev, where the Vite proxy
  is a different origin). Covers login/logout.
- `verifyToken` — double-submit: `X-CSRF-Token` header must equal the `csrf`
  cookie (constant-time). Mounted after `requireLogin`, so it protects every
  authenticated mutation; the client echoes the token via `api/http.js`.

### Data / DB access layer

- `db/pool.js` — one shared `pg.Pool` with bounds + timeouts (`max:10`, idle 30s,
  connect 10s, `statement_timeout` 15s) and an `error` handler so a dropped idle
  connection doesn't crash the process.
- `db/migrate.js` — applies `db/migrations/NNN_*.sql` in order inside a
  transaction, recording each in `schema_migrations`. Forward-only.
- **All SQL is parameterized (`$n`).** The only dynamic SQL is column/sort/assignment
  lists built from **server-side whitelists** (e.g. `routes/students.js` `SORTS`,
  the column maps in `parameters.js`/`users.js`/`groups.js`), never user strings.
  `LIKE` inputs are escaped. Recursive CTEs (group tree) are parameterized.
- Route handlers own their SQL; cross-cutting query helpers live in `lib/`
  (`results.js`, `groups.js`, `fields.js`, `savedViews.js`, `users.js`, etc.).
- Multi-statement writes use a checked-out client with `BEGIN`/`COMMIT`/`ROLLBACK`
  and `SELECT ... FOR UPDATE` where invariants must hold (evaluations bulk save,
  the "can't remove the last user/role manager" guards in `users.js`/`roles.js`).

### Feature routers (`routes/`) and their permission policies

- `auth.js` — `POST /login` (argon2 verify, dummy-hash on miss to equalize
  timing, rate-limited, `session.regenerate` on success), `POST /logout`,
  `GET /me`, `POST /change-password` (requires current password; wipes other
  sessions).
- `students.js` — CRUD + list (search/sort/paginate/group filter); restricted
  custom-field values stripped for users lacking `fields.view_restricted`.
- `parameters.js` / periods via `periods.js` + `lib/periods.js` +
  `lib/parameterUse.js` — parameters, their change history, and the period calendar.
- `evaluations.js` — `GET` (scores.view) and `PUT /evaluations/bulk`
  (scores.enter): validates, supports a `dryRun` preview (`lib/scorePreview.js`),
  lock handling + override (`lib/locks.js`), and audit of saves. Blind-entry
  users get a **redacted** preview (existing values hidden).
- `results.js` / `dashboard.js` — read-only aggregates (`lib/results.js`).
- `groups.js` + `lib/groups.js` — nested groups (cycle-prevented) and membership
  (`groups.assign` vs `groups.manage`).
- `fieldDefinitions.js` + `lib/fields.js` — custom student-field definitions and
  value validation.
- `roles.js` + `validation/role.js` — role CRUD with prerequisite enforcement.
- `users.js` + `validation/user.js` + `lib/userRules.js` — user management with
  self-protection invariants.
- `preferences.js` + `savedViews.js` — per-user prefs and saved result views
  (personal; excluded from the audit log).
- `audit.js` — read the audit log (filter by category/actor, paginated); writes
  come from `middleware/audit.js` + `lib/audit.js` (+ `lib/auditRules.js` which
  redacts secret-like keys and decides what is recorded).

### Scripts and tests

- `scripts/createUser.js`, `scripts/seedSample.js`.
- `test/*.test.js` — `node:test` unit tests over the pure logic (permissions,
  locks, results, imports, score preview, periods, validation) plus
  `authMiddleware.test.js` and `csrf.test.js`. `permissions.test.js` is the
  end-to-end integration suite (gated behind `RUN_INTEGRATION`).

## Client architecture (`client/src/`)

### Entry and providers

- `main.jsx` — creates the `QueryClient` (defaults: `staleTime` 30s, `gcTime`
  5 min, `refetchOnWindowFocus:false`, no-retry on network errors; a
  `QueryCache`/`MutationCache` `onError` signs the user out on 401), applies the
  remembered theme, and mounts the tree: `QueryClientProvider` → `ErrorBoundary`
  → `BrowserRouter` → `AuthProvider` → `PreferencesProvider` → `App`.
- `auth/` — `AuthProvider.jsx` holds the provider; `AuthContext.jsx` exports the
  context + `useAuth` (kept split so the many `useAuth` importers are stable and
  to satisfy `react-refresh/only-export-components`). `useAuth` exposes
  `user`, `isLoading`, `loadError`, `can(key)`, `login`, `logout`. `user` comes
  from `GET /api/auth/me` (query key `['me']`).
- `preferences/` — same split (`PreferencesProvider.jsx` + `PreferencesContext.jsx`);
  per-user preferences (theme, sort, etc.) with optimistic updates.

### Routing and auth gating — `App.jsx`, `components/RequireAuth.jsx`, `components/Layout.jsx`

- `App.jsx` — `LoginPage` is eager; **every other page is `React.lazy`**. Routes
  nest under `<RequireAuth>` → `<Layout>`. The `<Suspense>` boundary for the
  lazy pages lives in `Layout` around `<Outlet/>`.
- `RequireAuth.jsx` — shows loading/error, redirects to `/login` when signed
  out, and forces `/change-password` when `user.mustChangePassword`.
- `Layout.jsx` — the app shell: a grouped, permission-filtered sidebar
  (`NAV_SECTIONS`, native `<details>` groups), a topbar with the page title and
  `AccountMenu`, and a mobile drawer (matchMedia, focus trap, Escape,
  `inert` when closed). `AccountMenu.jsx` is a full WAI-ARIA menu (keyboard nav,
  focus return).

### Server state — `api/` + react-query

- `api/http.js` — the single `fetch` wrapper: shapes errors (adds `.status`,
  `.data`), defaults JSON content type (skipped for `FormData`), and echoes the
  `X-CSRF-Token` header (read from the `csrf` cookie) on mutating requests.
- `api/*.js` — thin per-resource functions (`students`, `parameters`,
  `evaluations`, `results`, `dashboard`, `users`, `roles`, `groups`, `fields`,
  `preferences`, `savedViews`, `audit`, `periods`, `auth`) that call `request()`.
- Pages call these through `useQuery`/`useMutation`. Mutations invalidate the
  affected query keys on success (e.g. saving scores invalidates
  `['evaluations']`, `['results']`, `['trends']`). `usePeriods` overrides
  `staleTime` to 30 min (near-static).

### Pages and components

- `pages/` — one component per route (Dashboard, Students, StudentDetail,
  Evaluate, Parameters, Results, ImportStudents, ImportScores, Users, Roles,
  Groups, Fields, Preferences, Settings, ChangePassword, Audit, Login, NotFound).
- `components/` — shared UI: forms (`StudentForm`, `UserForm`, `ParameterForm`),
  tables/rows, `EvaluationGrid` (memoized `EvaluationRow` + `rowsEqual` so a
  keystroke re-renders only its row), `GroupFilter`, `ConnectionBanner`,
  `ErrorBoundary`, `PageLoader`, chart views, etc.
- `lib/` — pure helpers, unit-tested where non-trivial: `cells.js` (score
  parse/validate/save payload), `resultsView.js` (filter/sort/stats),
  `dashboard.js` (aggregates), `csv.js` (CSV build with formula-injection
  guard), `scoreImport.js`/`importNames.js` (import parsing), `format.js`,
  `numbers.js`, `theme.js`, `studentFields.js`, `useDebouncedValue.js`,
  `usePeriods.js`.
- `index.css` — one token-based stylesheet. Light + dark theming via
  `:root` / `:root[data-theme='dark']` / `prefers-color-scheme` on
  `data-theme='system'`. Soft transitions gated behind
  `prefers-reduced-motion`. All class names are shared here (no CSS modules).

## Client ↔ server data flow

1. Browser loads the SPA (in prod from the same Node process; in dev from Vite,
   which proxies `/api` → `:3000`).
2. `AuthProvider` calls `GET /api/auth/me`. That response also sets the `csrf`
   cookie (via the server's `issue` middleware) so it exists before login.
3. The user logs in (`POST /api/auth/login`) → server verifies argon2, regenerates
   the session, returns the user (with `permissions`). The `sid` session cookie
   is set.
4. Pages fetch data through `api/*` + react-query. The session cookie authenticates
   each request; the server re-derives `req.user`/permissions per request.
5. Mutations send `X-CSRF-Token`; the server checks it (and Origin in prod),
   authorizes by permission key, writes (transactionally where needed), and
   audits. The client invalidates affected query keys.
6. The client's `can(key)` only hides/shows UI — **the server enforces every
   permission**; the UI is a convenience, the API is the gate.

## Security posture (where to look)

- AuthN: argon2 (`lib/passwords.js`), login rate limit + timing equalization
  (`routes/auth.js`), session regeneration, eviction of deactivated users.
- AuthZ: fixed permission catalogue + fail-closed `authorize` (`middleware/auth.js`,
  `lib/permissions.js`); server-side enforcement on every route.
- CSRF: double-submit token + Origin check (`middleware/csrf.js`).
- Headers/CSP: `helmet` in `index.js`.
- Cookies/TLS: `SESSION_COOKIE_SECURE` + `TRUST_PROXY`; HTTPS via reverse proxy
  (`deploy/Caddyfile.example`, README).
- SQL: parameterized everywhere; dynamic parts are whitelists.
- Secrets: `SESSION_SECRET` validated at boot; audit log redacts secret-like keys.

## Conventions

- ES modules everywhere; `.jsx` for React components, `.js` for logic/helpers.
- Keep business logic in `lib/` (pure, testable) and I/O in routes/components.
- Match existing patterns: parameterized SQL + whitelists, permission-keyed
  routes, react-query for all server state, one CSS file with shared class names.
- Prefer adding a `node:test`/Vitest test alongside non-trivial logic.
- Don't introduce `react-router-dom` (this project uses `react-router` v8),
  browser storage in place of react state, or unparameterized SQL.
</content>
