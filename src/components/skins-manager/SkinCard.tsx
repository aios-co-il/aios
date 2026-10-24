import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Sparkles,
  Pencil,
  Copy,
  Globe,
  Building2,
  Wrench,
  Zap,
} from "lucide-react";
import type { Skin } from "./types";

export function SkinCard({
  skin,
  avatarUrl,
  onEdit,
  onClone,
}: {
  skin: Skin;
  avatarUrl?: string;
  onEdit: (s: Skin) => void;
  onClone: (s: Skin) => void;
}) {
  const isGlobal = skin.scope === "global";
  return (
    <Card className="p-4 space-y-2 text-right">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isGlobal ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Globe className="h-3 w-3" />
              גלובלי
            </Badge>
          ) : (
            <Badge className="gap-1 text-[10px]">
              <Building2 className="h-3 w-3" />
              ארגון
            </Badge>
          )}
          {!skin.is_active && (
            <Badge variant="outline" className="text-[10px] opacity-70">
              כבוי
            </Badge>
          )}
          <code className="text-[10px] text-muted-foreground">{skin.slug}</code>
        </div>
        <div className="flex items-center gap-1.5">
          {avatarUrl ? (
            <CarmenPortrait
              image={avatarUrl}
              name={skin.name}
              custom
              className="!h-10 !w-10 shrink-0"
            />
          ) : (
            <Sparkles className="h-4 w-4 text-orange-500" />
          )}
          <span className="font-medium">{skin.name}</span>
        </div>
      </div>
      {skin.goal && (
        <p className="text-xs text-muted-foreground">🎯 {skin.goal}</p>
      )}
      {skin.description && (
        <p className="text-xs text-muted-foreground">{skin.description}</p>
      )}
      {skin.allowed_tools && skin.allowed_tools.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-end">
          <Wrench className="h-3 w-3 text-muted-foreground" />
          {skin.allowed_tools.slice(0, 8).map((t) => (
            <span
              key={t}
              className="text-[10px] bg-muted rounded px-1.5 py-0.5"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {skin.triggers && skin.triggers.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-end">
          <Zap className="h-3 w-3 text-muted-foreground" />
          {skin.triggers.slice(0, 6).map((t) => (
            <span key={t} className="text-[10px] text-primary/80">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 justify-end pt-1">
        {isGlobal ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => onClone(skin)}
          >
            <Copy className="h-3 w-3" />
            שכפל לעריכה
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => onEdit(skin)}
          >
            <Pencil className="h-3 w-3" />
            ערוך
          </Button>
        )}
      </div>
    </Card>
  );
}
