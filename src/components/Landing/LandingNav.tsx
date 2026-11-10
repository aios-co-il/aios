import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpLeft, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AiosLogo } from "./AiosLogo";
import { ColorModeToggle } from "./ColorModeToggle";
import type { ColorMode } from "./useColorMode";
import { NAV_LINKS, WHATSAPP_URL } from "./landingContent";

interface LandingNavProps {
  mode: ColorMode;
  onToggleMode: () => void;
}

/** Sticky frosted-glass header: links, light/dark switch and calls to action. */
export function LandingNav({ mode, onToggleMode }: LandingNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="material-glass sticky top-0 z-50 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 md:px-6">
        <a href="#top" aria-label="AIOS">
          <AiosLogo orb className="text-3xl" />
        </a>
        <nav
          aria-label="ניווט ראשי"
          className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ColorModeToggle mode={mode} onToggle={onToggleMode} />
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden md:flex"
          >
            <Link to="/auth">התחברות</Link>
          </Button>
          <span className="hidden md:inline-flex">
            <TalkButton size="sm" />
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      <MobileMenu open={open} onNavigate={() => setOpen(false)} />
    </header>
  );
}

/** Primary "let's talk" button that opens WhatsApp. */
export function TalkButton({
  size,
  label = "בואו נדבר",
}: {
  size?: "sm" | "lg";
  label?: string;
}) {
  return (
    <Button asChild size={size}>
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
        {label}
        <ArrowUpLeft />
      </a>
    </Button>
  );
}

/** Collapsible link list for small screens. */
function MobileMenu({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
}) {
  return (
    <nav
      aria-label="ניווט ראשי"
      className={cn(
        "flex-col gap-1 border-t px-4 pb-4 pt-2 md:hidden",
        open ? "flex" : "hidden",
      )}
    >
      {NAV_LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent"
        >
          {link.label}
        </a>
      ))}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button asChild variant="outline">
          <Link to="/auth" onClick={onNavigate}>
            התחברות
          </Link>
        </Button>
        <TalkButton />
      </div>
    </nav>
  );
}
