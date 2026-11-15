import type { ReactNode } from "react";

/** Centered RTL card every state of the unsubscribe page renders in. */
export function UnsubscribeCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <main
      dir="rtl"
      lang="he"
      className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-8"
    >
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm sm:p-8">
        {subtitle && (
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            {subtitle}
          </p>
        )}
        <h1 className="mb-3 text-xl font-semibold">{title}</h1>
        <div className="space-y-4">{children}</div>
      </div>
    </main>
  );
}
