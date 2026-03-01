import { Component, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { PreferencesProvider } from './context/PreferencesContext';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: 'red' }}>
          <h2>App crashed:</h2>
          <pre>{(this.state.error as Error).message}</pre>
          <pre>{(this.state.error as Error).stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <PreferencesProvider>
        <RouterProvider router={router} />
      </PreferencesProvider>
    </ErrorBoundary>
  );
}
