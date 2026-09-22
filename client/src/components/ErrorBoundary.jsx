import { Component } from 'react';

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
          <h1>Something went wrong</h1>
          <p>
            This screen hit an unexpected error. Reloading the page usually
            fixes it.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;