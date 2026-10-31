import type { ReactNode } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Globe, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS } from "../../../supabase/functions/_shared/workshop/departments.ts";
import { useWorkshopClientCard } from "./useWorkshopClientCard";

const siteHref = (url: string) =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;

const shortDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "d.M");
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

const EMPTY = <span className="text-muted-foreground">—</span>;

export function WorkshopClientCard({
  tenantId,
  clientId,
  onNewProject,
}: {
  tenantId: string | undefined;
  clientId: string;
  /** Starts a new project of this department in the chat (its label, as the card shows it). */
  onNewProject: (department: string) => void;
}) {
  const { client, sites, seoReport, ranks, gsc, pbn } = useWorkshopClientCard(
    tenantId,
    clientId,
  );

  const name = client.data?.name?.trim() || "לקוח";
  const website = client.data?.website?.trim();

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <section className="mx-auto w-full max-w-3xl rounded-xl border bg-card p-5 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">כרטיס לקוח</p>
            <h2 className="truncate text-lg font-semibold">
              {client.isLoading ? "…" : name}
            </h2>
          </div>
          {website ? (
            <a
              href={siteHref(website)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              dir="ltr"
            >
              <Globe className="h-4 w-4" />
              {website}
            </a>
          ) : null}
        </header>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Block title="אתרי וורדפרס מחוברים">
            {sites.data?.length ? (
              <ul className="space-y-0.5">
                {sites.data.map((site) => (
                  <li key={site.id} className="truncate">
                    <a
                      href={siteHref(site.site_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {site.site_name?.trim() || site.site_url}
                    </a>
                    {site.is_active === false ? (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        (לא פעיל)
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              EMPTY
            )}
          </Block>
          <Block title="דוח SEO חודשי אחרון">
            {seoReport.data?.month
              ? format(new Date(seoReport.data.month), "MMMM yyyy", {
                  locale: he,
                })
              : EMPTY}
          </Block>
          <Block title="מעקב דירוגים">
            {ranks.data
              ? `${ranks.data.projects} פרויקטים · ${ranks.data.keywords} ביטויים`
              : EMPTY}
          </Block>
          <Block
            title={
              gsc.data
                ? `קליקים מ-Search Console, ${shortDate(gsc.data.start)}–${shortDate(gsc.data.end)}`
                : "קליקים מ-Search Console"
            }
          >
            {gsc.data ? (
              <>
                {gsc.data.clicks.toLocaleString("he-IL")}
                <span className="text-xs text-muted-foreground">
                  {" "}
                  (28 ימים, לפי ביטויים)
                </span>
              </>
            ) : (
              EMPTY
            )}
          </Block>
          <Block title="קישורי PBN שפורסמו החודש">{pbn.data ?? EMPTY}</Block>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-medium">פרויקט חדש</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Every department starts here, in the chat and on the board; a department with no
                workshop tools yet (campaigns) is not offered. */}
            {DEPARTMENTS.map(({ id, label, screen }) =>
              id === "creative" || screen ? (
                <Button
                  key={id}
                  size="sm"
                  variant={id === "creative" ? "default" : "outline"}
                  className="gap-1"
                  onClick={() => onNewProject(label)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {label}
                </Button>
              ) : (
                <Button key={id} size="sm" variant="outline" disabled>
                  {label} · בקרוב
                </Button>
              ),
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
