import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import AccountMenu from './AccountMenu.jsx';

const user = { fullName: 'Maria Lopez', role: 'Administrator' };

function renderMenu(props = {}) {
  return render(
    <MemoryRouter>
      <AccountMenu user={user} onSignOut={() => {}} {...props} />
    </MemoryRouter>,
  );
}

describe('AccountMenu', () => {
  it('starts closed', () => {
    renderMenu();
    expect(
      screen.getByRole('button', { name: /Maria Lopez/ }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click and reveals the personal actions', async () => {
    const person = userEvent.setup();
    renderMenu();
    await person.click(screen.getByRole('button', { name: /Maria Lopez/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Preferences' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Change password' }),
    ).toBeInTheDocument();
  });

  it('calls onSignOut when Sign out is chosen', async () => {
    const person = userEvent.setup();
    const onSignOut = vi.fn();
    renderMenu({ onSignOut });
    await person.click(screen.getByRole('button', { name: /Maria Lopez/ }));
    await person.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('closes when Escape is pressed', async () => {
    const person = userEvent.setup();
    renderMenu();
    await person.click(screen.getByRole('button', { name: /Maria Lopez/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await person.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves focus to the first item when opened', async () => {
    const person = userEvent.setup();
    renderMenu();
    await person.click(screen.getByRole('button', { name: /Maria Lopez/ }));
    expect(screen.getByRole('menuitem', { name: 'Preferences' })).toHaveFocus();
  });

  it('walks between items with the arrow keys, wrapping at the ends', async () => {
    const person = userEvent.setup();
    renderMenu();
    await person.click(screen.getByRole('button', { name: /Maria Lopez/ }));

    await person.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitem', { name: 'Change password' }),
    ).toHaveFocus();

    await person.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();

    // Wraps back to the top.
    await person.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Preferences' })).toHaveFocus();

    // End jumps to the last item, Home back to the first.
    await person.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    await person.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Preferences' })).toHaveFocus();
  });

  it('returns focus to the trigger when closed with Escape', async () => {
    const person = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Maria Lopez/ });
    await person.click(trigger);
    await person.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('opens to the first item with ArrowDown and the last with ArrowUp', async () => {
    const person = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Maria Lopez/ });

    trigger.focus();
    await person.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Preferences' })).toHaveFocus();

    await person.keyboard('{Escape}');
    await person.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
  });

  it('shows a signing-out state and disables the action', async () => {
    const person = userEvent.setup();
    renderMenu({ signingOut: true });
    await person.click(screen.getByRole('button', { name: /Maria Lopez/ }));
    expect(
      screen.getByRole('menuitem', { name: /Signing out/ }),
    ).toBeDisabled();
  });
});
