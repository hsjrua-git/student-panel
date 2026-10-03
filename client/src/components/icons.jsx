// Small inline SVG glyphs used in the score grids and elsewhere, replacing the
// emoji (🔒 📝 🗒) that rendered inconsistently across platforms and ignored the
// theme. Each inherits `currentColor` and sizes to ~1em, so surrounding CSS
// (e.g. `.lock`, `.note-toggle`) controls colour and scale. Decorative by
// default (aria-hidden); the interactive controls that host them carry their own
// aria-label.
function Svg({ children, size = 15, title, ...rest }) {
  return (
    <svg
      {...rest}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// A closed padlock: the locked-cell marker.
export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

// An empty note: a plain lined card, for "add a note".
export function NoteIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="4" width="15" height="16" rx="2" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </Svg>
  );
}

// A note with content: the card plus a small pencil, for "edit note".
export function NoteFilledIcon(props) {
  return (
    <Svg {...props}>
      <path d="M13 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V11" />
      <path d="M8 9h4M8 12.5h3.5" />
      <path d="M18.4 3.6a1.6 1.6 0 0 1 2.3 2.3l-5.1 5.1-2.7.6.6-2.7 4.9-5.3Z" />
    </Svg>
  );
}

// An up-arrow into a tray: the marker for the import file drop-zones.
export function UploadIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

// A down-arrow out of a tray: the marker for downloads / the Export Center.
export function DownloadIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 4v11" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

// A plain X: dismiss a dialog or drawer.
export function CloseIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

/* ---- sidebar navigation glyphs ----
   One per menu item, sharing the same Svg wrapper (currentColor, ~1em) so they
   inherit the nav link's colour and sit on the icon-only collapsed rail. */

// Four tiles: the dashboard/overview.
export function DashboardIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

// A small bar chart: results.
export function ResultsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4" />
      <path d="M12 16V8.5" />
      <path d="M16 16v-6.5" />
    </Svg>
  );
}

// Two figures: students.
export function StudentsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M3.6 19.5a5.5 5.5 0 0 1 10.8 0" />
      <path d="M15.6 5.3a3.2 3.2 0 0 1 0 6" />
      <path d="M17.2 19.5a5.5 5.5 0 0 0-2.3-4.4" />
    </Svg>
  );
}

// A clipboard with a check: enter/evaluate scores.
export function EvaluateIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 5.5h14v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M9 4.5h6v3H9z" />
      <path d="m8.5 13 2 2 3.5-4" />
    </Svg>
  );
}

// Two sliders: parameters/settings-of-measure.
export function ParametersIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 8h7M15 8h5" />
      <circle cx="13" cy="8" r="2" />
      <path d="M4 16h5M13 16h7" />
      <circle cx="11" cy="16" r="2" />
    </Svg>
  );
}

// A small node tree: groups.
export function GroupsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5" r="2.4" />
      <circle cx="5" cy="18.5" r="2.4" />
      <circle cx="19" cy="18.5" r="2.4" />
      <path d="M12 7.4v3.1M12 10.5H5v5.6M12 10.5h7v5.6" />
    </Svg>
  );
}

// Brackets around a line: custom fields.
export function FieldsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M8 4.5H6.5a2 2 0 0 0-2 2V9M4.5 15v2.5a2 2 0 0 0 2 2H8" />
      <path d="M16 4.5h1.5a2 2 0 0 1 2 2V9M19.5 15v2.5a2 2 0 0 1-2 2H16" />
      <path d="M8.5 12h7" />
    </Svg>
  );
}

// A cog: settings.
export function SettingsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.6v2.8M12 18.6v2.8M21.4 12h-2.8M5.4 12H2.6M18.6 5.4l-2 2M7.4 16.6l-2 2M18.6 18.6l-2-2M7.4 7.4l-2-2" />
    </Svg>
  );
}

// A single figure: user management.
export function UsersIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </Svg>
  );
}

// A shield with a check: roles/permissions.
export function RolesIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 19 5.6v5.4c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V5.6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

// A clock with a hand: the audit history log.
export function AuditIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3 1.9" />
    </Svg>
  );
}

// Double chevron: the sidebar collapse-to-rail toggle. Rotated 180° by CSS
// when the rail is already collapsed, so one glyph serves both directions.
export function ChevronsLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="m13 6-6 6 6 6" />
      <path d="m19 6-6 6 6 6" />
    </Svg>
  );
}

/* ---- pinned account actions (sidebar bottom) ---- */

// Two upright sliders: personal preferences (distinct from the horizontal
// ParametersIcon so the account action doesn't read as the Parameters page).
export function PreferencesIcon(props) {
  return (
    <Svg {...props}>
      <path d="M7 4v7M7 15v5" />
      <circle cx="7" cy="13" r="2" />
      <path d="M17 4v3M17 11v9" />
      <circle cx="17" cy="9" r="2" />
    </Svg>
  );
}

// A door with an arrow leaving it: sign out.
export function SignOutIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9" />
    </Svg>
  );
}
