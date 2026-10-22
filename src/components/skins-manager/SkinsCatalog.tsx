import { Globe, Building2 } from "lucide-react";
import type { Skin } from "./types";
import { SkinCard } from "./SkinCard";

export function SkinsCatalog({
  embedded,
  globals,
  tenantSkins,
  avatarFor,
  onEdit,
  onClone,
}: {
  embedded: boolean;
  globals: Skin[];
  tenantSkins: Skin[];
  avatarFor: (slug?: string) => string | undefined;
  onEdit: (s: Skin) => void;
  onClone: (s: Skin) => void;
}) {
  return (
    <div className={embedded ? "space-y-6" : "space-y-6 pl-2"}>
      {tenantSkins.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-right flex items-center gap-1.5 justify-end">
            <Building2 className="h-4 w-4" />
            סקינז של הארגון ({tenantSkins.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {tenantSkins.map((s) => (
              <SkinCard
                key={s.id}
                skin={s}
                avatarUrl={avatarFor(s.slug)}
                onEdit={onEdit}
                onClone={onClone}
              />
            ))}
          </div>
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-right flex items-center gap-1.5 justify-end">
          <Globe className="h-4 w-4" />
          קטלוג גלובלי ({globals.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {globals.map((s) => (
            <SkinCard
              key={s.id}
              skin={s}
              avatarUrl={avatarFor(s.slug)}
              onEdit={onEdit}
              onClone={onClone}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
