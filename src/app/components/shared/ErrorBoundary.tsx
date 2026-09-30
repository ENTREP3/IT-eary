import React from 'react';

/**
 * Catches a crash so the screen does not simply go white.
 *
 * React unmounts the entire tree when a render throws and nothing catches it.
 * The page stays loaded, the address bar is unchanged, and every pixel is
 * blank — which reads as the shop being broken, and leaves no way forward but
 * closing the app. That has happened twice here: once from a realtime
 * subscription, once from stacked auth listeners.
 *
 * Both were fixed at the cause. This exists because the next one has not been
 * written yet, and a karinderya cannot be asked to debug a white rectangle
 * during lunch.
 *
 * ---------------------------------------------------------------------------
 * Offering a way out, not an apology
 *
 * The one thing that reliably recovers a broken React tree is remounting it,
 * which is what reloading does. So the button does that, and says so plainly.
 * Going back to the menu is offered too, because a diner whose account page
 * broke can still order — and ordering is the thing they came for.
 *
 * The message itself is deliberately not the error. "Cannot read properties of
 * undefined" tells a customer nothing and looks alarming. The details go to
 * the console, where somebody who can act on them will look.
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
