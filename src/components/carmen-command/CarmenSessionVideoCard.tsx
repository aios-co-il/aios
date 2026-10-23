import { useNavigate } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { useTenantPath } from "@/hooks/useTenantPath";
import { useCarmenIdentity } from "@/hooks/useCarmenIdentity";
import type { useDraggableCard } from "./useDraggableCard";
import type { CarmenFaceState } from "./CarmenFace";

interface CarmenSessionVideoCardProps {
  videoCard: ReturnType<typeof useDraggableCard>;
  faceState: CarmenFaceState;
  onClose?: () => void;
}

/** Draggable Carmen portrait card shown during a work session. */
export function CarmenSessionVideoCard({
  videoCard,
  faceState,
  onClose,
}: CarmenSessionVideoCardProps) {
  const navigate = useNavigate();
  const { buildPath, isReady } = useTenantPath();
  const identity = useCarmenIdentity();
  return (
    <div
      ref={videoCard.ref}
      className="carmen-session-video"
      aria-label={identity.name}
      title="אפשר לגרור את החלון"
      style={videoCard.style}
      {...videoCard.handlers}
    >
      <button
        type="button"
        title="פתח במסך מלא — הגדרות וכלים"
        aria-label={`פתח את ${identity.name} במסך מלא — הגדרות וכלים`}
        disabled={!isReady}
        onClick={() => {
          navigate(buildPath("command-center"));
          onClose?.();
        }}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-950/60 text-white backdrop-blur-sm transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <img
        key={identity.image}
        src={identity.image}
        alt=""
        className={`carmen-session-character ${identity.custom ? "is-custom" : ""}`}
      />
      <div className="carmen-session-caption">
        <span className="carmen-session-dot" />
        {identity.name}
        <span>
          {faceState === "listening"
            ? "מקשיבה"
            : faceState === "speaking"
              ? "מדברת"
              : "איתך"}
        </span>
      </div>
    </div>
  );
}
