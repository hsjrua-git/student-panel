# Findings — project audit 2026-10-25

Outcome of the "fix everything" pass. **All findings from the first audit are
resolved or explicitly dispositioned**; the remaining items are listed at the
end. The repo is clean, every suite is green, and the full API surface is
smoke-verified.

## Fixed

1. **App could not boot** — `validation/cafeInventory.js` imported
   `./ids.js` (should be `../lib/ids.js`); `npm start` died. Root cause:
   tests never boot the full app.
2. **POS student endpoints 500'd** — `routes/cafeBalances.js` +
   `routes/cafeSales.js` selected `students.code`; the column is
   `student_code`. Every student search / student sale failed at runtime.
3. **Cafe purchases list 500'd when filtered** — the route built `$1/$2`
   placeholders but never passed the values array (the UI always sends
   from/to).
4. **Cafe inventory 500'd** — `ORDER BY lower(productName)` used a SELECT
   alias inside an expression, which Postgres rejects.
5. **RTL horizontal overflow (10k px of document scroll)** — the skip-link's
   physical `left: -9999px` is inside RTL's scrollable overflow direction.
   Now `inset-inline-start`, with the mirrored focus state.
6. **Wrong landing after forced password change** — hardcoded
   `navigate('/students')`; now `firstAllowedPath(can)` (Administrators land
   on the dashboard, verified live).
7. **Mobile horizontal overflow** — `.row` now wraps (sessions generate card
   at 390px), and wide tables (accounting mappings) scroll inside their
   `section-card` on narrow screens instead of widening the document.
8. **Repo hygiene** — personal/reference material untracked but kept on disk
   (`Mine/`, `helpful/`, `student-panel-tutoring/`, notes, ER diagram,
   `answers.md`, `evaluation database`, `backups/` incl. a Sep DB dump), the
   empty root `package.json`/lock untracked (their .gitignore rules predated
   their tracking), and the `student-panel-compacted` submodule pointer
   committed at its rebuilt commit.
9. **Dead code deleted** — `src/App.css` (self-documented Vite leftover),
   `src/components/HeadlineCards.jsx` (superseded by CompletionHub),
   `src/auth/roles.js` (unreferenced). Kept: `api/local.js` +
   `db/bootstrap.js` (documented mobile/PGlite path).
10. **DRY pass on the front end** — new `lib/money.js` (formatWhole/
    formatAmount/parseWholeNumber/parseQuantity, unit-tested) replaces the
    eight per-page money formatters and ten per-page input parsers;
    `startOfJalaliMonth` moved into `lib/locale.js` (was copied in four
    pages); the duplicated `StatCard` extracted to `components/`. Pages now
    import shared helpers — full lint (zero warnings), 197/197 client tests,
    build green.
11. **New guards so this class of bug cannot hide again:**
    `agent/scripts/apiSmoke.mjs` logs in and GETs all 43 read endpoints with
    the queries their own UIs send (43/43 OK), and the voice agent's live
    smoke exercises real HTTP login/sale/void end to end.

## Dispositioned (no change needed)

- **three.js (544 KB chunk)** — intentional: CohortConstellation is a
  hand-built WebGL hero (drag-orbit, depth-fade, hover picking), lazy-loaded
  into its own chunk only when motion + WebGL are available. Not redundancy.
- **Sidebar rail starts collapsed on desktop** — a documented design default
  (`ref 5's slim-rail default` in Layout.jsx), toggleable per session.
- **Satellite «0/31» labels** — render within their 44 px boxes (verified:
  no clipping); the tour screenshot was low-resolution, not an overflow.
- **Topbar title** — correct on load and after reload; no lag reproduced
  after the fixes above (earlier screenshot was a stale bundle).

## Remaining (deliberate, for the maintainer)

- The **demo user** (`demo` / `panel-demo-2026-tour`, Administrator) exists
  for the tour — delete or demote it whenever you're done looking around.
- A **full manual visual pass** (every page, both languages, keyboard + screen
  reader) was beyond this pass; the automated probes (document overflow,
  visible errors, error boundaries) are clean on all 30 routes at 1440×900
  and 390×844.
- The UI tour found one wording nit worth a follow-up: the Evaluate page h1
  says «ثبت نمره» while the nav/topbar say «ثبت نمرات» — align whichever you
  prefer.

---

# Nav redesign + AI panel — 2026-10-25 (second pass)

Finished the interrupted nav-redesign chat and shipped the AI panel. The
interrupted chat had left the tree **unbuildable**: the rewritten
`navigation.js` dropped `EXTRA_TITLES`/`extraTitleForPath` which `Layout.jsx`
still imports, and none of the new panel classes (`nav-flat`, `panel-*`)
existed in `index.css` yet. Both restored/completed here.

## Shipped

1. **Two-level sidebar** (approved design): the expanded rail lists the five
   panels (Evaluation / Cafe / Accounting / AI / Administration, user's
   grouping); selecting one swaps the sidebar to that panel's pages with a
   «همه بخش‌ها» back control; landing on any page deep-link opens its panel
   automatically (render-time adjust, no effect). The collapsed icon rail
   stays flat exactly as before. Old `<details>` group CSS removed.
2. **AI panel** — migration 028 (`agent.view`, no prerequisite, seeded to
   Administrator; applied to the live DB), `routes/agent.js` (`/api/agent/
   status` + `/api/agent/transcripts`, both `agent.view`-gated, filters
   validated, 100-turn cap with `truncated`), client pages
   `AgentPage` (kiosk footprint + setup checklist pairing the data with
   agent/README.md steps; the running-process step is honestly "manual")
   and `AgentTranscriptsPage` (session/role/date filters, dir="auto" text,
   audio-kept badge, meta expander), born bilingual (`agent.json` fa/en).
3. **i18n**: `nav.json` `sections` → `panels` (+ `allPanels`, items.agent /
   items.transcripts) in both languages; `admin.json` `permissionGroups.AI`
   (Roles page renders «هوش مصنوعی» / "AI").
4. apiSmoke now covers the two agent endpoints (45 endpoints, all OK).

## Found during the visual tour (fixed in place)

5. **Specificity**: `.transcript-how { white-space: normal }` lost to
   `.table-wrap td`'s nowrap — the setup checklist overflowed its card and
   pushed the status badges off-screen. Re-scoped at `.table-wrap` depth.
6. **The global `.table-wrap table { min-width: max-content }` floor** then
   still defeated the wrap (long how-to lines forced a horizontal scrollbar).
   These two tables now shrink (`:has(.transcript-…)` override).
7. **Double active highlight**: in the panel view, NavLink's prefix matching
   lit BOTH AI pages on `/agent/transcripts`. The panel view now highlights
   the longest item path that prefixes the location (the collapsed rail keeps
   its exact-match rule).

## Verified

Client lint + 197/197 tests + build; server 183 pass / 4 skipped
(integration gated); apiSmoke 45/45; live tour as Administrator in fa + en,
desktop + mobile drawer: panel list, swap, back, auto-active on deep links,
both AI pages (live Jalali timestamps, checklist badges), Roles group label.
Tour artifacts (throwaway user, seeded transcript turns) removed afterwards.
