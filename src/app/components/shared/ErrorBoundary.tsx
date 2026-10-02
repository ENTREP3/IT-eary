import React from 'react';

/**
 * Catches a crash so the screen does not simply go white.
 */
type Props = { children: React.ReactNode };
type State = { crashed: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept out of the interface and put where it is useful. Without this the
    // cause is lost entirely, and a white screen with no trace is the hardest
    // kind of bug to chase.
    // eslint-disable-next-line no-console
    console.error('[Bencris] a screen crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div className="min-h-screen bg-diner-ground text-diner-ink grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <h1
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
            className="text-2xl"
          >
            Something went wrong
          </h1>
          <p className="mt-3 text-sm opacity-70 leading-relaxed">
            This screen stopped working. Nothing you have ordered is affected — your ticket and
            your order are safe.
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full h-11 rounded-full bg-diner-ink text-diner-ground"
          >
            Reload the page
          </button>
          <a
            href="/menu"
            className="mt-2 block w-full h-11 leading-[2.75rem] rounded-full border border-diner-ink/20 text-sm"
          >
            Back to the menu
          </a>
        </div>
      </div>
    );
  }
}
