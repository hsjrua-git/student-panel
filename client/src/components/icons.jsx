// Small inline SVG glyphs used in the score grids and elsewhere, replacing the
// emoji (🔒 📝 🗒) that rendered inconsistently across platforms and ignored the
// theme. Each inherits `currentColor` and sizes to ~1em, so surrounding CSS
// (e.g. `.lock`, `.note-toggle`) controls colour and scale. Decorative by
// default (aria-hidden); the interactive controls that host them carry their own
// aria-label.
function Svg({ children, size = 15, title }) {
  return (
    <svg
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
