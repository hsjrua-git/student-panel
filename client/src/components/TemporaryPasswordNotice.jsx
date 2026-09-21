import { useState } from 'react';

function TemporaryPasswordNotice({ notice, onDismiss }) {
  const [copyState, setCopyState] = useState(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(notice.temporaryPassword);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="notice" role="status">
      <p>
        <strong>
          {notice.kind === 'created' ? 'Account created.' : 'Password reset.'}
        </strong>{' '}
        Give this temporary password to <strong>{notice.username}</strong>. It
        is shown only once, and they must choose a new password at their next
        sign-in.
      </p>
      <p>
        <code className="secret">{notice.temporaryPassword}</code>
      </p>
      <div className="row">
        <button type="button" onClick={copy}>
          Copy
        </button>
        <button type="button" onClick={onDismiss}>
          I have saved it
        </button>
      </div>
      {copyState === 'copied' && <p className="success">Copied.</p>}
      {copyState === 'failed' && (
        <p className="hint">
          Could not copy automatically. Select the text and copy it yourself.
        </p>
      )}
    </div>
  );
}

export default TemporaryPasswordNotice;