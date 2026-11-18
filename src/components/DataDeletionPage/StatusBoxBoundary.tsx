import { Component, type ErrorInfo, type ReactNode } from "react";
import { StatusUnavailable } from "./StatusUnavailable";

interface State {
  failed: boolean;
}

/**
 * Keeps a failure of the status box, such as its chunk not loading, inside the
 * box, so the deletion instructions stay on the page.
 */
export class StatusBoxBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[data-deletion] status box failed", error, info);
  }

  render() {
    if (this.state.failed) {
      // A failed chunk import stays cached until the page reloads. The reload
      // is user-initiated, so a lasting failure cannot loop.
      return (
        <>
          <StatusUnavailable />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 text-primary hover:underline"
          >
            טען מחדש <span dir="ltr">(Reload)</span>
          </button>
        </>
      );
    }

    return this.props.children;
  }
}
