import { Component } from 'react';
import EmptyState from './EmptyState.jsx';

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in the interface:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main>
          <EmptyState
            tone="danger"
            title="Something went wrong"
            description="This screen hit an unexpected error. Reloading the page usually fixes it."
          >
            <button
              type="button"
              className="primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </EmptyState>
        </main>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
