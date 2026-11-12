import { Suspense, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  nodeRef: RefObject<HTMLDivElement>;
  children: ReactNode;
};

/** The width the summary image is laid out at, as the share link on a desktop. */
const CAPTURE_WIDTH_PX = 1200;

/**
 * An off-screen render of the share page that the send flow photographs. It
 * is mounted only while sending, so opening a client card takes no picture.
 */
export function HiddenCaptureFrame({ nodeRef, children }: Props) {
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: -9999,
        top: -9999,
        zIndex: -9999,
        pointerEvents: "none",
        opacity: 0,
      }}
      aria-hidden="true"
      data-testid="report-capture-frame"
    >
      <div
        ref={nodeRef}
        style={{
          width: `${CAPTURE_WIDTH_PX}px`,
          backgroundColor: "#ffffff",
        }}
      >
        <Suspense
          fallback={<div aria-busy="true" style={{ minHeight: 500 }} />}
        >
          {children}
        </Suspense>
      </div>
    </div>,
    document.body,
  );
}
