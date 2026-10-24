# VERSION-NOTES — which copy this is and why

Written 2026-10-24 while migrating the project from Claude Code to ZCode.

## This copy

Copied from `/data/projects/for AI/student-panel` — the git repository, at
branch `1`, HEAD `f4ed023` (2026-10-07, ".gitignore" tweak) on top of
`main` @ `744ecb7` "shit done" (2026-10-04). The full commit history
(2026-09-22 → 2026-10-07) came with it:

audit trail → user management → edit locks → preferences → results page with
saved views → dashboard + charts → CSV export → student/score import → security
hardening → "Student Panel: Express API, React SPA, migrations, tests, security
hardening" → permission-aware UI + authz fixes → Aurora redesign (glass
surfaces, palettes) → final touches.

## Why this one won

- The **only** variant that has all three of: `.git` (full history),
  `server/.env` (working local database: `stu_database` on localhost), and a
  built `client/dist`.
- Verified identical in app code to `/data/projects/for-AI-git/student-panel`
  (`diff -rq` of `server/` and `client/`: only `.env`, `hp-check.log`, and
  `client/dist` differ) — and that copy also contains the same reference
  materials (answers.md, ER/, deploy/, scripts/, "evaluation database", Mine/,
  student-panel-ER.html, …), all of which are present here too.
- Last real work happened in this tree (commits Oct 4–7); the Claude Code
  sessions ran here (`/data/projects/for AI`).

## What was excluded from the copy

- `node_modules/` (server ~8.5M, client ~230M) — restore with `npm install`
  (or `npm ci`) in `server/` and `client/`.
- `server/hp-check.log` (transient log).

## Where the other variants live (untouched originals)

| Path | What it is |
|---|---|
| `/data/projects/for AI/` | the original of this copy + the media/redesign working files |
| `/data/projects/for-AI-git/` | same app code without `.git`/`.env` + nested compacted/tutoring variants |
| `/data/projects/for AI cli/`, `/data/projects/student-panel/` | older snapshots (Sep 22 – Oct 4) |
| `~/Documents/opencode/student-panel-compacted/`, `-tutoring/` | reference copies used by the learning project |

## Running it here

1. `cd server && npm install` (Node ≥ 20; `.env` is already in place).
2. Local PostgreSQL must be running with the `stu_database` database
   (the MCP server `postgres` in ZCode is configured against the same URL).
3. `npm run dev` for the API; from `client/`: `npm install && npm run dev`.
4. Full walkthrough: `README.md`; first-time bootstrap: `bash setup.sh`.
