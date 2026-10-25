# Findings — project audit 2026-10-25

Collected during the "run the project and check everything" pass. The UI
portion is **partial** (login, students, dashboard at 1440×900 only) — the
tour was interrupted to prioritize Phase 5. Fix these together in a dedicated
session; nothing here was deleted or "fixed" beyond the one bug noted.

## Fixed during the audit

1. **Broken app boot (critical, fixed):**
   `server/src/validation/cafeInventory.js` imported `./ids.js` instead of
   `../lib/ids.js`, so `npm start` died with ERR_MODULE_NOT_FOUND. The test
   suite never caught it because tests import libs directly and never boot
   the full app; `node --check` only checks syntax. Server suite re-ran green
   after the fix. **Recommendation:** add a boot-smoke (`node --eval "import
  ('./src/index.js')"`) to CI/verification so app-boot is exercised, or an
   integration test that imports `src/index.js`.
2. **Cafe student-identity API was broken (critical, fixed):** the students
   table's column is `student_code`, but `routes/cafeBalances.js` selected
   `s.code` (both the search filter and the projection) and
   `routes/cafeSales.js` selected `sf.code` — every POS student search and
   student sale would 500. Caught by the Phase-5 live smoke (the first
   end-to-end exercise of those endpoints); fixed and verified. Same root
   cause as §1: SQL in routes is only exercised when the app actually runs.

## How to run / what state

- Server: `cd server && npm start` → http://localhost:3000 (serves the built
  SPA; health at `/api/health`). Was verified running during this audit.
- Client bundle: rebuilt 2026-10-25 (includes the accounting pages).
- Demo account created for the tour: `demo` / `panel-demo-2026-tour`
  (Administrator). **Delete it after the fix session** (Users page).
- Migration 027 (Kiosk role + voice_transcripts) is applied to the live DB
  but **not yet committed** — it belongs to the in-flight Phase 5 work.

## Repository hygiene findings (not fixed — decisions needed)

2. **`student-panel-compacted` submodule pointer moved** (`c4724b3` →
   `bfc8ed1` "Rebuild as single-user prototype (embedded PGlite, zero-setup
   launcher)"). The change predates this session (visible in git status from
   the start). Decide: commit the pointer bump, or reset it.
3. **Root `package.json` is `{}`** and still TRACKED — the `.gitignore`
   rules (`/package.json`, `/package-lock.json`) were added after tracking,
   so they have no effect. `git rm --cached package.json package-lock.json`
   is the fix; an empty manifest at the root can confuse npm tooling.
4. **Personal/reference material is tracked in git:** `Mine/` (incl.
   `to send.txt`), `helpful/`, `student-panel-tutoring/` (38 files of
   database-design lesson PDFs), `student-panel-explained.txt`,
   `student-panel-rules.txt`, `student-panel-ER.html`, `answers.md`,
   `evaluation database` (a tracked text dump), `backups/`
   (`student-panel-20260922-145708.sql.gz` — a DB dump in git).
   Recommend moving these out of the repo (or into a private branch/repo);
   DB dumps should never live in git.
5. **three.js chunk is 544 KB (135 KB gz)** for one component
   (`CohortConstellation`, used by the dashboard constellation). It is
   lazy-loaded so it only downloads when needed, but an SVG/CSS orbit would
   drop the dependency entirely. Low priority.

## UI findings (partial tour, 1440×900, Persian/RTL)

6. **Landing after login was `/students`, not `/dashboard`** for an
   Administrator. `firstAllowedPath()` should prefer `/dashboard`
   (dashboard.view). Verify: fresh reload → where does it land? Suspects:
   permissions not yet attached when `firstAllowedPath` ran after the
   change-password flow, or the dev DB's Administrator role missing
   `dashboard.view` (check `role_permissions`).
7. **Topbar title lags the page**: while on `/dashboard` the topbar showed
   «دانش‌آموز» (the previous page's title). Likely a stale `titleForPath`
   render or the keyed title animation swallowing the update. Reproducible
   via sidebar navigation; check `Layout.jsx` `currentTitle`.
8. **Horizontal overflow at 1440×900** — a horizontal scrollbar appears on
   students and dashboard. Some fixed-width element (likely a table min-width
   or the `.filter-row`/toolbar rows) exceeds the main column. Find with
   devtools `document.scrollingElement.scrollWidth > innerWidth`.
9. **Constellation satellite labels clip**: the small circles on the
   dashboard constellation show «31/» with the count cut off
   (`CohortConstellation` label sizing at 0% completion).
10. **Sidebar rail starts collapsed** at 1440×900 (icons only). If the
    intended default is expanded at desktop widths, check the
    `railCollapsed` default/matchMedia logic in `Layout.jsx`.
11. **Not yet toured** (fix session should cover, incl. mobile 390×844):
    evaluate grid, results, student detail (balance panel), sessions with
    JalaliDatePicker rows, schedule, all cafe pages, all accounting pages
    (journal line editor uses `.filter-row`/`segmented` inside a card —
    check wrap), users/roles/audit, preferences; RTL mirroring of the
    mobile drawer and param-drawer; recharts RTL axis mirroring.

## Notes

- The audit created no data besides the `demo` user and one built
  `client/dist`. No repo files were deleted; the only code change is the
  import fix in §1 (plus the in-flight, uncommitted Phase 5 migration).
