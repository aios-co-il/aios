// Single-color brand marks, drawn in `currentColor` so a sphere can set them
// in its own core color. Used only to show the integrations.

/** Google "G" mark. */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
      <path d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.9-6.1z" />
      <path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Facebook "f" mark. */
export function FacebookMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 8.5V6.6c0-.9.6-1.1 1-1.1h2.6V1.6L14.1 1.6C10.2 1.6 9.3 4.5 9.3 6.4v2.1H6.9v4h2.4V23h4.7V12.5h3.2l.4-4H14z" />
    </svg>
  );
}
