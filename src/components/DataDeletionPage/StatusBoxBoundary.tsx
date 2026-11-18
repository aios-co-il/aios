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
      return <StatusUnavailable />;
    }

    return this.props.children;
  }
}
