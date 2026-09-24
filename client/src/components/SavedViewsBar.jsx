function SavedViewsBar({
  views,
  activeId,
  dirty,
  busy,
  error,
  onLoad,
  onSaveAs,
  onUpdate,
  onRename,
  onDelete,
  onReset,
}) {
  return (
    <>
      <div className="views-bar">
        <label className="inline">
          View
          <select
            value={activeId ?? ''}
            onChange={(event) => onLoad(event.target.value || null)}
          >
            <option value="">Unsaved view</option>
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={activeId ? undefined : 'primary'}
          onClick={onSaveAs}
          disabled={busy}
        >
          Save as new…
        </button>
        {activeId && (
          <>
            <button
              type="button"
              className="primary"
              onClick={onUpdate}
              disabled={busy || !dirty}
            >
              Update view
            </button>
            <button type="button" onClick={onRename} disabled={busy}>
              Rename…
            </button>
            <button
              type="button"
              className="danger"
              onClick={onDelete}
              disabled={busy}
            >
              Delete view
            </button>
          </>
        )}
        <button type="button" className="quiet" onClick={onReset}>
          Reset
        </button>
        {activeId && dirty && <span className="hint">Changed since saved</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

export default SavedViewsBar;