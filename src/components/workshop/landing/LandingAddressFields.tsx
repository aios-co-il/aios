import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LANDING_ROOT_DOMAIN,
  type LandingSettings,
  type LandingSettingsDraft,
} from "./landingSettings";

/** A landing page's address: the client's subdomain and the page's slug, each fixed once created. */
export function LandingAddressFields({
  draft,
  saved,
  onChange,
}: {
  draft: LandingSettingsDraft;
  saved: LandingSettings;
  onChange: (draft: LandingSettingsDraft) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="landing-subdomain">תת־דומיין של הלקוח</Label>
        <div className="flex items-center gap-1" dir="ltr">
          <Input
            id="landing-subdomain"
            value={draft.subdomain}
            disabled={saved.siteExists}
            onChange={(event) =>
              onChange({
                ...draft,
                subdomain: event.target.value.toLowerCase(),
              })
            }
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            .{LANDING_ROOT_DOMAIN}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="landing-slug">כתובת העמוד</Label>
        <Input
          id="landing-slug"
          dir="ltr"
          value={draft.slug}
          disabled={saved.pageExists}
          onChange={(event) =>
            onChange({ ...draft, slug: event.target.value.toLowerCase() })
          }
        />
        <p className="text-xs text-muted-foreground">
          home הוא העמוד הראשי של האתר.
        </p>
      </div>
    </div>
  );
}
