import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../state/api.ts';

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without a boundary, one throwing component makes React unmount the whole app (black page until F5).
 * Each panel gets its own, so a crash stays local, is reported to the engine log, and can be retried.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(`react:${this.props.name}`, error, info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <strong>💥 {this.props.name} crashed</strong>
        <code>{this.state.error.message}</code>
        <button onClick={() => this.setState({ error: null })}>Retry</button>
      </div>
    );
  }
}
