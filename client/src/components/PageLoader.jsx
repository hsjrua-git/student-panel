// Shown by <Suspense> while a lazily-loaded page's code chunk is downloading.
// role="status" + aria-live so screen readers announce the wait; the visible
// text is deliberately plain to match the app's other loading states.
function PageLoader() {
  return (
    <main aria-busy="true">
      <p role="status" aria-live="polite">
        Loading…
      </p>
    </main>
  );
}

export default PageLoader;
