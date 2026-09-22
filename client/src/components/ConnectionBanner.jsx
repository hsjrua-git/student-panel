import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

function ConnectionBanner() {
  const queryClient = useQueryClient();
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const error = event.query.state.error;
      const isNetworkError =
        error instanceof Error && error.status === undefined;
      if (event.query.state.status === 'error' && isNetworkError) {
        setBroken(true);
      } else if (event.query.state.status === 'success') {
        setBroken(false);
      }
    });
    return unsubscribe;
  }, [queryClient]);

  if (!broken) return null;
  return (
    <div className="connection-banner" role="alert">
      Cannot reach the server. Check that it is running, then this will
      recover automatically.
    </div>
  );
}

export default ConnectionBanner;