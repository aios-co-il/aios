import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CreativeImage } from "@/components/marketing/departments/creative/CreativeImage";
import {
  Clapperboard,
  Copy,
  Film,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  Save,
  Settings2,
  Square,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import type { StoryboardFrame, VideoSceneStatus } from "./types";
import { makeStoryboardFrame, storyboardFrameX } from "./utils";
import type { StillModel } from "./videoStill";
import {
  SCENE_ENGINE_LABEL,
  SOUND_ENGINE_LABEL,
  type SceneEngine,
  type SoundEngine,
} from "./videoEngines";
import { canAnimate } from "./videoClip";

export interface SceneStillVersion {
  id: string;
  url: string;
  version: number;
}

interface Props {
  frames: StoryboardFrame[];
  onChange: (frames: StoryboardFrame[]) => void;
  onSave: () => Promise<void>;
  onGenerateFrame: (frame: StoryboardFrame) => Promise<void>;
  /** Change the existing still with a short instruction ("move Carmen left"). */
  onEditWithPrompt?: (
    frame: StoryboardFrame,
    instruction: string,
  ) => Promise<void>;
  loadVersions?: (frameId: string) => Promise<SceneStillVersion[]>;
  onSelectVersion?: (frame: StoryboardFrame, assetId: string) => Promise<void>;
  character?: {
    url?: string;
    uploading?: boolean;
    onUpload: (file: File) => void;
    onClear: () => void;
  };
  stillModel?: StillModel;
  onStillModelChange?: (model: StillModel) => void;
  sceneEngine?: SceneEngine;
  onSceneEngineChange?: (engine: SceneEngine) => void;
  soundEngine?: SoundEngine;
  onSoundEngineChange?: (engine: SoundEngine) => void;
  /** One click: make what is missing (stills, clips, voice, music) and assemble the film. */
  production?: {
    running: boolean;
    /** Client-side step before the worker takes over, e.g. "יוצר פריים 2 מתוך 5". */
    busyLabel?: string | null;
    progress: { label: string; percent: number } | null;
    hasFilm: boolean;
    error?: string | null;
    onProduce: () => void;
    onStop?: () => void;
  };
  /** The draft has edits that are not saved yet. */
  dirty?: boolean;
  /** Project name and menu, shown at the start of the toolbar (one bar per studio). */
  titleSlot?: ReactNode;
  /** Trailing action, e.g. "אשר לקמפיינים". */
  endSlot?: ReactNode;
  /** A scene to bring into view (from the Carmen chat); `n` re-fires the same scene. */
  focusRequest?: { id: string; n: number } | null;
  /** Reports the scene the user has open, for the chat context. */
  onSelectFrame?: (id: string | null) => void;
  film?: {
    status: string;
    url?: string | null;
    error?: string | null;
  };
  /** Reference video: upload starts an analysis; when done the proposal can be opened. */
  reference?: {
    status:
      "idle" | "uploading" | "queued" | "running" | "completed" | "failed";
    error?: string | null;
    onUpload: (file: File) => void;
    onOpenProposal: () => void;
  };
  /** Image-to-video: signed clip URLs by frame id; re-animate one scene (asks for budget first). */
  clips?: {
    urls: Record<string, string>;
    onAnimate: (frames: StoryboardFrame[]) => void;
  };
  generating?: boolean;
  saving?: boolean;
  scenePanelOpen?: boolean;
  onScenePanelOpenChange?: (open: boolean) => void;
}

const STATUS_LABEL: Record<VideoSceneStatus, string> = {
  draft: "טיוטה",
  still_generating: "נוצר…",
  still_ready: "מוכן לאישור",
  still_approved: "מאושר",
  clip_generating: "מונפש…",
  clip_ready: "קליפ מוכן",
  clip_approved: "קליפ מאושר",
  failed: "נכשל",
};

const STATUS_CLASS: Partial<Record<VideoSceneStatus, string>> = {
  still_ready: "bg-amber-500/90 text-white",
  still_approved: "bg-emerald-600/90 text-white",
  clip_ready: "bg-sky-600/90 text-white",
  clip_approved: "bg-emerald-700/90 text-white",
  failed: "bg-destructive text-destructive-foreground",
};

const SHOTS = [
  "Close-up",
  "Medium shot",
  "Wide shot",
  "POV",
  "Product shot",
  "UGC handheld",
  "Cinematic tracking",
];

/** Frames in strip order with order/x recomputed (RTL: frame 1 on the right). */
const renumber = (frames: StoryboardFrame[]): StoryboardFrame[] =>
  frames.map((frame, index) => ({
    ...frame,
    order: index + 1,
    x: storyboardFrameX(index + 1),
  }));

function FrameCard({
  frame,
  clipUrl,
  selected,
  onSelect,
  onToggleLock,
}: {
  frame: StoryboardFrame;
  clipUrl?: string;
  selected: boolean;
  onSelect: () => void;
  onToggleLock: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: frame.id });
  const status = frame.status ?? "draft";
  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "w-56 shrink-0 overflow-hidden border-2 bg-card p-0 shadow-sm",
        selected && "border-pink-500 ring-4 ring-pink-500/10",
        isDragging && "z-10 opacity-80 shadow-xl",
      )}
    >
      <button
        type="button"
        className="block w-full text-right"
        onClick={onSelect}
      >
        <div className="relative aspect-video bg-muted">
          {clipUrl ? (
            <video
              src={clipUrl}
              poster={frame.imageUrl}
              muted
              loop
              playsInline
              preload="none"
              className="h-full w-full object-cover"
              onMouseEnter={(event) => void event.currentTarget.play()}
              onMouseLeave={(event) => event.currentTarget.pause()}
            />
          ) : frame.imageUrl ? (
            <CreativeImage
              src={frame.imageUrl}
              alt={frame.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="mb-2 h-7 w-7 opacity-40" />
              <span className="text-[10px]">פריים טרם נוצר</span>
            </div>
          )}
          <Badge className="absolute right-2 top-2 bg-black/70 text-white hover:bg-black/70">
            {frame.order}
          </Badge>
          <Badge
            className={cn(
              "absolute left-2 top-2 text-[10px]",
              STATUS_CLASS[status] ?? "bg-background/90 text-foreground",
            )}
          >
            {STATUS_LABEL[status]}
          </Badge>
          <Badge
            variant="secondary"
            className="absolute bottom-2 left-2 text-[10px]"
          >
            {frame.duration} שנ׳
          </Badge>
          {frame.clipStale && (
            <Badge
              variant="outline"
              className="absolute bottom-2 right-2 bg-background/90 text-[10px]"
              title="הפריים או ההנחיה השתנו אחרי שהקליפ נוצר"
            >
              קליפ ישן
            </Badge>
          )}
        </div>
      </button>
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-muted-foreground"
          aria-label="גרירה לסידור מחדש"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 text-right"
          onClick={onSelect}
        >
          <div className="truncate text-xs font-bold">{frame.title}</div>
          <div className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-relaxed text-muted-foreground">
            {frame.visualPrompt ||
              frame.voiceover ||
              "בחר את הסצנה והוסף הנחיות"}
          </div>
        </button>
        <button
          type="button"
          className={cn(
            "mt-0.5",
            frame.locked ? "text-amber-600" : "text-muted-foreground",
          )}
          aria-label={frame.locked ? "בטל נעילה" : "נעל פריים"}
          title={frame.locked ? "נעול: לא ייווצר מחדש ב'צור הכל'" : "נעל פריים"}
          onClick={onToggleLock}
        >
          {frame.locked ? (
            <Lock className="h-4 w-4" />
          ) : (
            <LockOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </Card>
  );
}

function InsertButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full border border-dashed text-muted-foreground hover:border-pink-500 hover:text-pink-600"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}

export function CreativeStoryboardEditor({
  frames,
  onChange,
  onSave,
  onGenerateFrame,
  onEditWithPrompt,
  loadVersions,
  onSelectVersion,
  character,
  stillModel,
  onStillModelChange,
  sceneEngine,
  onSceneEngineChange,
  soundEngine,
  onSoundEngineChange,
  production,
  dirty,
  titleSlot,
  endSlot,
  focusRequest,
  onSelectFrame,
  film,
  reference,
  clips,
  generating,
  saving,
  scenePanelOpen,
  onScenePanelOpenChange,
}: Props) {
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(
    frames[0]?.id ?? null,
  );
  const [frameDraft, setFrameDraft] = useState<StoryboardFrame | null>(
    frames[0] ?? null,
  );
  const [internalSceneOpen, setInternalSceneOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [versions, setVersions] = useState<SceneStillVersion[]>([]);
  const [busy, setBusy] = useState<"edit" | "version" | null>(null);
  const characterInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);

  const sceneOpen = scenePanelOpen ?? internalSceneOpen;
  const setSceneOpen = onScenePanelOpenChange ?? setInternalSceneOpen;
  const ordered = [...frames].sort((a, b) => a.order - b.order);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (focusRequest && frames.some((frame) => frame.id === focusRequest.id))
      setSelectedFrameId(focusRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires per request only
  }, [focusRequest]);

  useEffect(() => {
    onSelectFrame?.(selectedFrameId);
  }, [selectedFrameId, onSelectFrame]);

  useEffect(() => {
    if (!selectedFrameId && frames[0]?.id) setSelectedFrameId(frames[0].id);
    if (
      selectedFrameId &&
      !frames.some((frame) => frame.id === selectedFrameId)
    ) {
      setSelectedFrameId(frames[0]?.id ?? null);
    }
  }, [frames, selectedFrameId]);

  useEffect(() => {
    const frame =
      frames.find((value) => value.id === selectedFrameId) ?? frames[0] ?? null;
    setFrameDraft(frame ? { ...frame } : null);
  }, [frames, selectedFrameId]);

  const selectedStillId = frames.find(
    (frame) => frame.id === selectedFrameId,
  )?.stillAssetId;
  useEffect(() => {
    let cancelled = false;
    setVersions([]);
    if (!sceneOpen || !selectedFrameId || !loadVersions) return;
    loadVersions(selectedFrameId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sceneOpen, selectedFrameId, selectedStillId, loadVersions]);

  const updateFrames = (next: StoryboardFrame[]) => onChange(renumber(next));

  const saveFrameDraft = () => {
    if (!frameDraft) return;
    onChange(
      frames.map((frame) => (frame.id === frameDraft.id ? frameDraft : frame)),
    );
  };

  const insertAt = (index: number) => {
    const frame = makeStoryboardFrame(index + 1);
    const next = [...ordered];
    next.splice(index, 0, frame);
    updateFrames(next);
    setSelectedFrameId(frame.id);
    setSceneOpen(true);
  };

  const duplicateFrame = () => {
    if (!frameDraft) return;
    const index = ordered.findIndex((frame) => frame.id === frameDraft.id);
    const copy = {
      ...frameDraft,
      id: crypto.randomUUID(),
      status: frameDraft.imageUrl
        ? ("still_ready" as const)
        : ("draft" as const),
      stillAssetId: undefined,
    };
    const next = [...ordered];
    next.splice(index + 1, 0, copy);
    updateFrames(next);
    setSelectedFrameId(copy.id);
  };

  const removeFrame = () => {
    if (!frameDraft) return;
    const next = ordered.filter((frame) => frame.id !== frameDraft.id);
    updateFrames(next);
    if (next.length === 0) setSceneOpen(false);
  };

  const toggleLock = (frameId: string) => {
    onChange(
      frames.map((frame) =>
        frame.id === frameId ? { ...frame, locked: !frame.locked } : frame,
      ),
    );
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((frame) => frame.id === active.id);
    const to = ordered.findIndex((frame) => frame.id === over.id);
    if (from < 0 || to < 0) return;
    updateFrames(arrayMove(ordered, from, to));
  };

  const selectFrame = (frameId: string) => {
    setSelectedFrameId(frameId);
    setInstruction("");
    setSceneOpen(true);
  };

  const run = async (kind: "edit" | "version", action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const draftClipUrl = frameDraft ? clips?.urls[frameDraft.id] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          {titleSlot}
          {production &&
            (production.running || production.busyLabel ? (
              <Button
                size="sm"
                disabled
                className="gap-2 bg-gradient-to-r from-pink-600 to-violet-600 text-white"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {production.busyLabel ?? production.progress?.label ?? "מפיק…"}
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-pink-600 to-violet-600 text-white"
                disabled={frames.length === 0}
                onClick={production.onProduce}
                title="יוצר את מה שחסר (פריימים, הנפשה, קריינות ומוזיקה) ומרכיב סרט אחד"
              >
                <Clapperboard className="h-4 w-4" />
                {production.hasFilm ? "עדכן סרט" : "הפק סרט"}
              </Button>
            ))}
          {production?.busyLabel && production.onStop && (
            <Button size="sm" variant="ghost" onClick={production.onStop}>
              <Square className="h-3.5 w-3.5 fill-current" />
              עצור
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              שמור שינויים
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => insertAt(ordered.length)}
          >
            <Plus className="h-3.5 w-3.5" />
            סצנה
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                הגדרות
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4" dir="rtl">
              {character && (
                <div className="space-y-1.5">
                  <Label>דמות קבועה</Label>
                  <input
                    ref={characterInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) character.onUpload(file);
                      event.target.value = "";
                    }}
                  />
                  {character.url ? (
                    <div className="flex items-center gap-2">
                      <CreativeImage
                        src={character.url}
                        alt="דמות קבועה"
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <span className="flex-1 text-xs text-muted-foreground">
                        נשלחת בכל סצנה שהדמות מופיעה בה
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="הסר דמות"
                        onClick={character.onClear}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      disabled={character.uploading}
                      onClick={() => characterInput.current?.click()}
                    >
                      {character.uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserRound className="h-3.5 w-3.5" />
                      )}
                      העלה תמונת דמות
                    </Button>
                  )}
                </div>
              )}
              {onStillModelChange && (
                <div className="space-y-1.5">
                  <Label>מודל לפריימים</Label>
                  <Select
                    value={stillModel ?? "gpt-image-1"}
                    onValueChange={(value) =>
                      onStillModelChange(value as StillModel)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-image-1">gpt-image-1</SelectItem>
                      <SelectItem value="nano-banana-pro">
                        Nano Banana Pro (דמות עקבית)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {onSceneEngineChange && (
                <div className="space-y-1.5">
                  <Label>מנוע הנפשה</Label>
                  <Select
                    value={sceneEngine ?? "mock"}
                    onValueChange={(value) =>
                      onSceneEngineChange(value as SceneEngine)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(SCENE_ENGINE_LABEL) as [
                          SceneEngine,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(sceneEngine ?? "mock") === "mock" && (
                    <p className="text-[11px] text-muted-foreground">
                      תצוגה חינמית: זום איטי על התמונה. לסרט אמיתי בחרו
                      ElevenLabs.
                    </p>
                  )}
                </div>
              )}
              {onSoundEngineChange && (
                <div className="space-y-1.5">
                  <Label>סאונד</Label>
                  <Select
                    value={soundEngine ?? "elevenlabs"}
                    onValueChange={(value) =>
                      onSoundEngineChange(value as SoundEngine)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(SOUND_ENGINE_LABEL) as [
                          SoundEngine,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {reference && (
                <div className="space-y-1.5 border-t pt-3">
                  <Label>סרטון רפרנס</Label>
                  <input
                    ref={referenceInput}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) reference.onUpload(file);
                      event.target.value = "";
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5"
                      disabled={["uploading", "queued", "running"].includes(
                        reference.status,
                      )}
                      onClick={() => referenceInput.current?.click()}
                    >
                      {["uploading", "queued", "running"].includes(
                        reference.status,
                      ) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Film className="h-3.5 w-3.5" />
                      )}
                      {reference.status === "uploading"
                        ? "מעלה…"
                        : reference.status === "queued" ||
                            reference.status === "running"
                          ? "מנתח…"
                          : "העלה סרטון"}
                    </Button>
                    {reference.status === "completed" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={reference.onOpenProposal}
                      >
                        הצעת סטוריבורד
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {reference.status === "failed"
                      ? `הניתוח נכשל${reference.error ? `: ${reference.error}` : ""}`
                      : "כרמן מפרקת אותו לשוטים ומציעה סטוריבורד באותו קצב."}
                  </p>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {endSlot}
        </div>
      </div>

      {production?.progress && (
        <div className="border-b px-4 py-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-l from-pink-500 to-violet-500 transition-all"
              style={{ width: `${production.progress.percent}%` }}
            />
          </div>
        </div>
      )}
      {production?.error && !production.running && (
        <p className="border-b px-4 py-2 text-xs text-destructive">
          ההפקה נכשלה: {production.error}
        </p>
      )}
      {film?.url && (
        <div className="flex flex-col items-center gap-2 border-b bg-muted/30 px-4 py-4">
          <video
            key={film.url}
            src={film.url}
            controls
            playsInline
            className="max-h-[360px] rounded-lg bg-black shadow"
          />
          <a
            href={film.url}
            download
            className="text-xs font-medium text-pink-600 hover:underline"
          >
            הורדת הסרט
          </a>
        </div>
      )}

      {frames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
          <div>
            <p className="text-sm">אין סצנות עדיין</p>
            <Button className="mt-4 gap-2" onClick={() => insertAt(0)}>
              <Plus className="h-4 w-4" />
              הוסף סצנה ראשונה
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto" dir="rtl">
          <p className="px-4 pt-3 text-[11px] text-muted-foreground">
            פריים 1 קובע סגנון, הבאים נוצרים מולו. גררו פריים לסידור מחדש, +
            מוסיף סצנה במקום.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((frame) => frame.id)}
              strategy={rectSortingStrategy}
            >
              <div className="flex w-max items-stretch gap-2 p-4">
                {ordered.map((frame, index) => (
                  <div key={frame.id} className="flex items-stretch gap-2">
                    {index > 0 && (
                      <InsertButton
                        onClick={() => insertAt(index)}
                        label={`הוסף סצנה בין ${index} ל-${index + 1}`}
                      />
                    )}
                    <FrameCard
                      frame={frame}
                      clipUrl={clips?.urls[frame.id]}
                      selected={frame.id === selectedFrameId}
                      onSelect={() => selectFrame(frame.id)}
                      onToggleLock={() => toggleLock(frame.id)}
                    />
                  </div>
                ))}
                <InsertButton
                  onClick={() => insertAt(ordered.length)}
                  label="הוסף סצנה בסוף"
                />
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <Sheet open={sceneOpen} onOpenChange={setSceneOpen}>
        <SheetContent
          side="left"
          className="flex w-[380px] max-w-[90vw] flex-col gap-0 p-0 sm:max-w-[380px]"
          dir="rtl"
        >
          <SheetHeader className="border-b px-6 py-4 text-right">
            <SheetTitle>
              {frameDraft ? `עריכת סצנה ${frameDraft.order}` : "עריכת סצנה"}
            </SheetTitle>
          </SheetHeader>
          {frameDraft ? (
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                {draftClipUrl ? (
                  <div className="overflow-hidden rounded-md border">
                    <video
                      key={draftClipUrl}
                      src={draftClipUrl}
                      poster={frameDraft.imageUrl}
                      controls
                      loop
                      playsInline
                      className="aspect-video w-full bg-black object-contain"
                    />
                  </div>
                ) : (
                  frameDraft.imageUrl && (
                    <div className="overflow-hidden rounded-md border">
                      <CreativeImage
                        src={frameDraft.imageUrl}
                        alt={frameDraft.title}
                        className="aspect-video w-full object-cover"
                      />
                    </div>
                  )
                )}
                {versions.length > 1 && onSelectVersion && (
                  <div>
                    <Label>גרסאות</Label>
                    <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
                      {versions.map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          disabled={busy !== null}
                          title={`גרסה ${version.version}`}
                          onClick={() =>
                            version.id !== frameDraft.stillAssetId &&
                            void run("version", () =>
                              onSelectVersion(frameDraft, version.id),
                            )
                          }
                          className={cn(
                            "relative w-16 shrink-0 overflow-hidden rounded border-2",
                            version.id === frameDraft.stillAssetId
                              ? "border-pink-500"
                              : "border-transparent opacity-70 hover:opacity-100",
                          )}
                        >
                          <CreativeImage
                            src={version.url}
                            alt={`גרסה ${version.version}`}
                            className="aspect-video w-full object-cover"
                          />
                          <span className="absolute bottom-0 right-0 bg-black/60 px-1 text-[9px] text-white">
                            v{version.version}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {frameDraft.imageUrl && onEditWithPrompt && (
                  <div>
                    <Label>ערוך בהנחיה</Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        value={instruction}
                        placeholder="למשל: תזיז את הדמות שמאלה"
                        onChange={(event) => setInstruction(event.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !instruction.trim() || busy !== null || generating
                        }
                        onClick={() =>
                          void run("edit", async () => {
                            await onEditWithPrompt(
                              frameDraft,
                              instruction.trim(),
                            );
                            setInstruction("");
                          })
                        }
                      >
                        {busy === "edit" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <WandSparkles className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                <div>
                  <Label>שם הסצנה</Label>
                  <Input
                    className="mt-1"
                    value={frameDraft.title}
                    onChange={(event) =>
                      setFrameDraft({
                        ...frameDraft,
                        title: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>סוג שוט</Label>
                  <Select
                    value={frameDraft.shot}
                    onValueChange={(value) =>
                      setFrameDraft({ ...frameDraft, shot: value })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHOTS.map((shot) => (
                        <SelectItem key={shot} value={shot}>
                          {shot}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>מה רואים בפריים?</Label>
                  <Textarea
                    className="mt-1 min-h-24"
                    value={frameDraft.visualPrompt}
                    onChange={(event) =>
                      setFrameDraft({
                        ...frameDraft,
                        visualPrompt: event.target.value,
                      })
                    }
                  />
                </div>
                {character?.url && (
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span>הדמות מופיעה בסצנה</span>
                    <Switch
                      checked={frameDraft.hasCharacter !== false}
                      onCheckedChange={(checked) =>
                        setFrameDraft({ ...frameDraft, hasCharacter: checked })
                      }
                    />
                  </label>
                )}
                {clips && (
                  <div>
                    <Label>מה זז בסצנה?</Label>
                    <Textarea
                      className="mt-1 min-h-16"
                      placeholder="למשל: המצלמה מתקרבת לאט, הדמות מסובבת את הראש ומחייכת"
                      value={frameDraft.motionPrompt ?? ""}
                      onChange={(event) =>
                        setFrameDraft({
                          ...frameDraft,
                          motionPrompt: event.target.value,
                        })
                      }
                    />
                  </div>
                )}
                {clips && frameDraft.stillAssetId && frameDraft.imageUrl && (
                  <Button
                    variant="outline"
                    className="w-full gap-1.5"
                    disabled={!canAnimate(frameDraft) || busy !== null}
                    onClick={() => {
                      saveFrameDraft();
                      clips.onAnimate([frameDraft]);
                    }}
                  >
                    {frameDraft.status === "clip_generating" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clapperboard className="h-4 w-4" />
                    )}
                    {frameDraft.status === "clip_generating"
                      ? "מונפש…"
                      : frameDraft.clipAssetId
                        ? "הנפש את הסצנה מחדש"
                        : "הנפש סצנה"}
                  </Button>
                )}
                <div>
                  <Label>טקסט על המסך</Label>
                  <Textarea
                    className="mt-1 min-h-16"
                    dir="rtl"
                    value={frameDraft.overlayText}
                    onChange={(event) =>
                      setFrameDraft({
                        ...frameDraft,
                        overlayText: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>קריינות / דיאלוג</Label>
                  <Textarea
                    className="mt-1 min-h-20"
                    value={frameDraft.voiceover}
                    onChange={(event) =>
                      setFrameDraft({
                        ...frameDraft,
                        voiceover: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>משך בשניות</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    max={30}
                    value={frameDraft.duration}
                    onChange={(event) =>
                      setFrameDraft({
                        ...frameDraft,
                        duration: Number(event.target.value) || 1,
                      })
                    }
                  />
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={saveFrameDraft}
                >
                  <Save className="h-4 w-4" />
                  עדכן סצנה
                </Button>
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-pink-600 to-violet-600"
                  onClick={() => {
                    saveFrameDraft();
                    void onGenerateFrame(frameDraft);
                  }}
                  disabled={
                    generating ||
                    (!frameDraft.visualPrompt?.trim() &&
                      !frameDraft.voiceover?.trim())
                  }
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  {frameDraft.imageUrl ? "צור וריאציה" : "צור פריים"}
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  פריים 1 קובע את הסגנון. פריימים הבאים נוצרים מולו, ותמונת
                  הדמות נשלחת כרפרנס בכל סצנה שהיא מופיעה בה. תארו רק מה משתנה
                  בסצנה.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={duplicateFrame}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    שכפל
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive"
                    onClick={removeFrame}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    מחק
                  </Button>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
              בחר סצנה לעריכה
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
