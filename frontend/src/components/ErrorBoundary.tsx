import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crashed", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center px-4 text-center">
          <div className="rounded-2xl bg-tg-secondary-bg p-6">
            <p className="text-lg font-semibold text-tg-text">Что-то пошло не так</p>
            <p className="mt-1 text-sm text-tg-hint">Попробуйте перезапустить приложение.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 h-11 rounded-xl bg-tg-button px-4 text-sm font-medium text-tg-button-text"
            >
              Перезапустить
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
