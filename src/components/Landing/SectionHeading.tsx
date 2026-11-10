import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  kicker: string;
  title: ReactNode;
  /** Second title line, set in the muted tone. */
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Kicker, two-tone title and lead paragraph shared by every section. */
export function SectionHeading({
  kicker,
  title,
  subtitle,
  children,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <span
        dir="ltr"
        className="inline-block text-xs font-semibold tracking-[0.2em] text-muted-foreground"
      >
        {kicker}
      </span>
      <h2 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight md:text-5xl">
        {title}
        {subtitle && (
          <>
            <br />
            <span className="text-muted-foreground">{subtitle}</span>
          </>
        )}
      </h2>
      {children && (
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  );
}

/** A green full stop, the brand's signature mark on headlines. */
export function BrandDot() {
  return <span className="text-primary">.</span>;
}
