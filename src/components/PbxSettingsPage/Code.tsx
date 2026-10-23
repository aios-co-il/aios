import type { ReactNode } from "react";

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs" dir="ltr">
      {children}
    </code>
  );
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <pre
      className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre"
      dir="ltr"
    >
      {code}
    </pre>
  );
}
