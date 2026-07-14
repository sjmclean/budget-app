import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppRecoveryScreen } from "./AppRecoveryScreen";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: unknown | null;
  componentStack: string | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    componentStack: null,
  };

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Unhandled Budget App render error.", error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error !== null) {
      return (
        <AppRecoveryScreen
          error={this.state.error}
          source="react-boundary"
          componentStack={this.state.componentStack}
        />
      );
    }

    return this.props.children;
  }
}
