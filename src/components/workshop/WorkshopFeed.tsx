import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  LayoutGrid,
  Loader2,
  Paperclip,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { prefillComposer } from "@/lib/workshopBridge";
import { AssetsPanel } from "./AssetsPanel";
import { PageActions } from "./PageActions";
import { PageBody } from "./PageBody";
import { PageEditForm } from "./PageEditForm";
import { approveConceptLine, draftOf, type PageDraft } from "./pageEdit";
import { StoryboardGrid, type StoryboardGridProps } from "./StoryboardGrid";
import { useEditPage } from "./useEditPage";
import { useWorkshopAssets } from "./useWorkshopAssets";
import {
  SCENES_FOLDER,
  folderTabs,
  pagesIn,
  pageTypeFor,
  projectFormat,
  shouldFollow,
  type WorkshopArtifact,
} from "./workshopFeedModel";

const IDEAS = [
  "סרטון קצר של כרמן ליד מחשב",
  "מודעה לסטורי ולפיד לחג",
  "קמפיין לפתיחת סניף חדש",
];

const ASSETS_TAB = "__assets__";

/**
 * The board: every page Carmen produced for the project, one under the other, newest at the
 * bottom. While you follow, a new page scrolls into view like a new message in the chat.
 */
export function WorkshopFeed({
  artifacts,
  loading,
  hasProject,
  selectedId,
  onSelect,
  tenantId,
  projectId,
  clientName,
  storyboard,
  openChat,
}: {
  artifacts: WorkshopArtifact[];
  loading: boolean;
  hasProject: boolean;
  tenantId?: string;
  projectId?: string | null;
  clientName?: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The project's storyboard scenes; the scenes tab shows them as a grid of cards. */
  storyboard?: StoryboardGridProps;
  /** Opens Carmen's chat, where a concept approved on its page is sent. */
  openChat?: () => void;
}) {
  const [folder, setFolder] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    draft: PageDraft;
  } | null>(null);
  const editPage = useEditPage(tenantId, projectId ?? null);
  const [following, setFollowing] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  const assets = useWorkshopAssets(tenantId, projectId ?? null);
  const inAssets = folder === ASSETS_TAB && !!projectId;
  const sceneCount = storyboard?.scenes.length ?? 0;
  const inGrid = folder === SCENES_FOLDER && sceneCount > 0;
  const pages = pagesIn(artifacts, inAssets ? null : folder);
  const folders = folderTabs(artifacts, sceneCount);
  const project = projectFormat(artifacts);
  const shown = pages.length;
  const latestStoryboard = [...pages]
    .reverse()
    .find((page) => page.kind === "storyboard")?.id;

  // A scene stays picked only while its card is on screen.
  const openFolder = (next: string | null) => {
    setFolder(next);
    if (next !== SCENES_FOLDER) storyboard?.onSelect(null);
  };

  useEffect(() => {
    if (shouldFollow(seen.current, shown, following))
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    seen.current = shown;
  }, [shown, following]);

  useEffect(() => {
    setFolder(null);
    setFollowing(true);
    seen.current = 0;
  }, [artifacts[0]?.item_id]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-muted/30">
      {folders.length > 1 || (hasProject && !!projectId) ? (
        <nav
          aria-label="תיקיות הפרויקט"
          className="flex shrink-0 gap-1.5 overflow-x-auto border-b bg-background/80 px-3 py-2"
        >
          <Button
            type="button"
            size="sm"
            variant={folder === null ? "default" : "outline"}
            className="h-7 shrink-0 rounded-full px-3 text-xs"
            onClick={() => openFolder(null)}
          >
            הכול ({artifacts.length})
          </Button>
          {folders.map((entry) => (
            <Button
              key={entry.folder}
              type="button"
              size="sm"
              variant={folder === entry.folder ? "default" : "outline"}
              className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
              onClick={() => openFolder(entry.folder)}
            >
              {entry.folder === SCENES_FOLDER && sceneCount > 0 ? (
                <LayoutGrid className="h-3 w-3" />
              ) : null}
              {entry.label} ({entry.count})
            </Button>
          ))}
          {projectId ? (
            <Button
              type="button"
              size="sm"
              variant={inAssets ? "default" : "outline"}
              className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
              onClick={() => openFolder(ASSETS_TAB)}
            >
              <Paperclip className="h-3 w-3" />
              נכסים ({assets.data?.length ?? 0})
            </Button>
          ) : null}
        </nav>
      ) : null}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-6 md:px-8"
      >
        {inAssets && tenantId && projectId ? (
          <AssetsPanel
            tenantId={tenantId}
            projectId={projectId}
            clientName={clientName}
            assets={assets.data ?? []}
            loading={assets.isLoading}
          />
        ) : inGrid && storyboard ? (
          <StoryboardGrid {...storyboard} />
        ) : shown === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 text-center">
            {loading && hasProject ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Sparkles className="h-6 w-6 text-pink-500" />
                <p className="text-base font-medium">
                  {hasProject
                    ? "עוד אין כאן תוצרים"
                    : "תכתבי לכרמן מה בא לך ליצור"}
                </p>
                <p className="text-sm text-muted-foreground">
                  משפט אחד מספיק. היא תחליט על הגודל, הסגנון והאורך, ותציג כאן
                  כל תוצר בגדול.
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {IDEAS.map((idea) => (
                    <li key={idea}>״{idea}״</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            {pages.map((artifact) => (
              <article
                key={artifact.id}
                aria-label={artifact.title}
                onClick={() =>
                  onSelect(selectedId === artifact.id ? null : artifact.id)
                }
                className={cn(
                  "cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-sm transition",
                  selectedId === artifact.id
                    ? "border-pink-400 ring-2 ring-pink-400/40"
                    : "hover:shadow-md",
                )}
              >
                {editing?.id === artifact.id ? (
                  <PageEditForm
                    initial={editing.draft}
                    saving={editPage.isPending}
                    onCancel={() => setEditing(null)}
                    onSave={(draft) =>
                      editPage.mutate(
                        { artifact, draft },
                        { onSuccess: () => setEditing(null) },
                      )
                    }
                  />
                ) : (
                  <PageBody artifact={artifact} format={project} />
                )}
                {artifact.title && pageTypeFor(artifact) !== "brief" ? (
                  <footer className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{artifact.title}</span>
                    <PageActions
                      artifact={artifact}
                      onEdit={() => {
                        const draft = draftOf(artifact);
                        if (draft) {
                          setEditing({ id: artifact.id, draft });
                        }
                      }}
                      onApproveConcept={() => {
                        openChat?.();
                        prefillComposer(`${approveConceptLine(artifact)}\n`);
                      }}
                    />
                    {artifact.id === latestStoryboard && sceneCount > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          openFolder(SCENES_FOLDER);
                        }}
                      >
                        <LayoutGrid className="h-3 w-3" />
                        ללוח הסצנות
                      </Button>
                    ) : null}
                  </footer>
                ) : null}
              </article>
            ))}
            <div ref={bottom} />
          </div>
        )}
      </div>
      {!following && pages.length > 0 && !inAssets && !inGrid ? (
        <Button
          type="button"
          size="sm"
          className="absolute bottom-4 start-4 h-8 gap-1.5 rounded-full shadow-lg"
          onClick={() => {
            setFollowing(true);
            bottom.current?.scrollIntoView({
              behavior: "smooth",
              block: "end",
            });
          }}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          לאחרון
        </Button>
      ) : null}
    </div>
  );
}
