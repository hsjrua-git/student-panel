import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

// The signed-in user's menu, anchored to the top-right of every page. It shows
// who is signed in and gathers the personal actions (preferences, password,
// sign out) that used to sit loose in the header.
//
// It follows the WAI-ARIA menu button pattern: opening moves focus to the first
// item, Up/Down/Home/End move between items (wrapping), Escape closes and
// returns focus to the trigger, and Tab or an outside click dismisses it.
function AccountMenu({ user, onSignOut, signingOut = false }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemsRef = useRef([]);
  // Set when the menu is opened with ArrowUp, so the open effect lands focus on
  // the last item instead of the first (WAI-ARIA menu-button behaviour).
  const openToLastRef = useRef(false);
  const navigate = useNavigate();

  // The menu items, described as data so the keyboard handling can treat them
  // uniformly regardless of whether each renders as a link or a button.
  const items = [
    { key: 'preferences', label: 'Preferences', to: '/preferences' },
    {
      key: 'sign-out',
      label: signingOut ? 'Signing out…' : 'Sign out',
      danger: true,
      disabled: signingOut,
      onSelect: onSignOut,
    },
  ];

  // Indices of items that can actually take focus (disabled ones are skipped,
  // per the menu pattern).
  function enabledIndexes() {
    return items.reduce(
      (list, item, index) => (item.disabled ? list : [...list, index]),
      [],
    );
  }

  function focusIndex(index) {
    itemsRef.current[index]?.focus();
    setActiveIndex(index);
  }

  // Move focus among the enabled items in a direction (+1 / -1), wrapping.
  function stepFocus(direction) {
    const enabled = enabledIndexes();
    if (enabled.length === 0) return;
    const at = enabled.indexOf(activeIndex);
    const nextPos =
      at === -1
        ? direction > 0
          ? 0
          : enabled.length - 1
        : (at + direction + enabled.length) % enabled.length;
    focusIndex(enabled[nextPos]);
  }

  function focusEdge(edge) {
    const enabled = enabledIndexes();
    if (enabled.length === 0) return;
    focusIndex(edge === 'last' ? enabled[enabled.length - 1] : enabled[0]);
  }

  function selectItem(item) {
    setOpen(false);
    if (item.to) navigate(item.to);
    else item.onSelect?.();
  }

  // When the menu opens, move focus to the first item — or the last, if it was
  // opened with ArrowUp. Kept self-contained so the effect only depends on
  // `open` (refs are stable).
  useEffect(() => {
    if (!open) return;
    const nodes = itemsRef.current;
    const enabled = nodes
      .map((node, index) => (node && !node.disabled ? index : null))
      .filter((index) => index !== null);
    if (enabled.length === 0) return;
    const target = openToLastRef.current
      ? enabled[enabled.length - 1]
      : enabled[0];
    openToLastRef.current = false;
    nodes[target].focus();
    setActiveIndex(target);
  }, [open]);

  // While open, dismiss on an outside click, and close + return focus on Escape.
  useEffect(() => {
    if (!open) return undefined;

    function handlePointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleMenuKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        stepFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        stepFocus(-1);
        break;
      case 'Home':
        event.preventDefault();
        focusEdge('first');
        break;
      case 'End':
        event.preventDefault();
        focusEdge('last');
        break;
      case 'Tab':
        // Let focus leave the menu naturally, but close it behind us.
        setOpen(false);
        break;
      default:
        break;
    }
  }

  function handleTriggerKeyDown(event) {
    // Opening with Down or Up should land focus in the list, matching the
    // native menu-button behaviour: Down → first item, Up → last item.
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      openToLastRef.current = event.key === 'ArrowUp';
      setOpen(true);
    }
  }

  const initials = initialsOf(user.fullName);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-trigger"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="account-trigger-text">
          <span className="account-name">{user.fullName}</span>
          <span className="account-role">{user.role}</span>
        </span>
        <svg className="caret" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="account-dropdown"
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="account-dropdown-head">
            <span className="account-name">{user.fullName}</span>
            <span className="account-role">{user.role}</span>
          </div>
          <div className="account-dropdown-sep" role="separator" />
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              ref={(node) => {
                itemsRef.current[index] = node;
              }}
              className={`account-dropdown-item${item.danger ? ' danger' : ''}`}
              disabled={item.disabled}
              onClick={() => selectItem(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// First letters of the first and last words of a name, e.g. "Maria Lopez" → ML.
function initialsOf(fullName) {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export default AccountMenu;
