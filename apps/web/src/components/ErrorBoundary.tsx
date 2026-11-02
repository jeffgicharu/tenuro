import { Component, type ReactNode } from 'react';

interface Props {
  fallback(retry: () => void, error: Error): ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

// Catches a failed section (e.g. a query that errored) without taking down the whole page.
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  // A caught error is still a bug: log it so it shows in the console and in CI's browser checks.
  override componentDidCatch(error: Error) {
    console.error('Section failed to render:', error);
  }

  retry = () => {
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  override render() {
    return this.state.error ? this.props.fallback(this.retry, this.state.error) : this.props.children;
  }
}
