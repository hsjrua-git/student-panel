import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getSettings, updateSettings } from '../api/settings.js';

// App-wide settings for the single operator: the name shown in the account menu
// and the title shown in the shell. The login password is changed on its own
// page; periods now live on the Periods page, so this is just the two labels.
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const [operatorName, setOperatorName] = useState('');
  const [appTitle, setAppTitle] = useState('');
  const seeded = useRef(false);

  // Seed the form once, from the first successful load. A later background
  // refetch must not clobber in-progress edits, so we only seed one time.
  useEffect(() => {
    if (query.data && !seeded.current) {
      seeded.current = true;
      setOperatorName(query.data.operatorName ?? '');
      setAppTitle(query.data.appTitle ?? '');
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      updateSettings({ operatorName: operatorName.trim(), appTitle: appTitle.trim() }),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      // The shell title and account name come from GET /api/auth/me, so refresh
      // it to reflect the change immediately.
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const dirty =
    query.data &&
    (operatorName.trim() !== (query.data.operatorName ?? '') ||
      appTitle.trim() !== (query.data.appTitle ?? ''));

  return (
    <main>
      <h1>Settings</h1>

      <section className="section-card">
        <h2>Operator &amp; title</h2>
        <p className="hint">
          Your display name and the title shown across the app.
        </p>
        {query.isPending && <p className="hint">Loading…</p>}
        {query.isError && <p className="error">{query.error.message}</p>}
        {query.data && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <label>
              Operator name
              <input
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                maxLength={60}
                autoComplete="off"
              />
            </label>
            <label>
              App title
              <input
                value={appTitle}
                onChange={(event) => setAppTitle(event.target.value)}
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              disabled={save.isPending || !dirty || operatorName.trim() === '' || appTitle.trim() === ''}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {save.isError && (
              <p className="error" role="alert">
                {save.error.message}
              </p>
            )}
            {save.isSuccess && !dirty && (
              <p className="success" role="status">
                Saved.
              </p>
            )}
          </form>
        )}
      </section>

      <section className="section-card">
        <h2>Security</h2>
        <p className="hint">
          Change the password used to sign in to this panel.
        </p>
        <Link className="btn" to="/change-password">
          Change password
        </Link>
      </section>
    </main>
  );
}
