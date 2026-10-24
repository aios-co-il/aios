import {
  MAX_ASSET_TEXT,
  type AssetView,
} from "../../../supabase/functions/_shared/workshop/assets.ts";
import { MAX_USER_REFERENCES } from "../../../supabase/functions/_shared/workshop/look.ts";

export type WorkshopAsset = AssetView;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export { MAX_ASSET_TEXT, MAX_USER_REFERENCES };

export interface AssetSection {
  key: "client" | "image" | "link" | "text" | "file";
  label: string;
  items: WorkshopAsset[];
}

const SECTIONS: { key: AssetSection["key"]; label: string }[] = [
  { key: "client", label: "מהלקוח" },
  { key: "image", label: "תמונות ורפרנסים" },
  { key: "link", label: "קישורים ואתרים" },
  { key: "text", label: "בריפים וטקסט" },
  { key: "file", label: "קבצים" },
];

const sectionOf = (asset: WorkshopAsset): AssetSection["key"] => {
  if (asset.source === "client") return "client";
  if (asset.asset_type === "image" || asset.asset_type === "video")
    return "image";
  if (asset.asset_type === "link" || asset.asset_type === "site") return "link";
  if (asset.asset_type === "text") return "text";
  return "file";
};

/** The assets tab's sections in a fixed order; empty sections are left out. */
export function groupAssets(assets: WorkshopAsset[]): AssetSection[] {
  const ordered = [...assets].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  return SECTIONS.map((section) => ({
    ...section,
    items: ordered.filter((asset) => sectionOf(asset) === section.key),
  })).filter((section) => section.items.length > 0);
}

/** Only a picture with an https link can steer generation. */
export const canBeReference = (asset: WorkshopAsset) =>
  asset.asset_type === "image" && /^https:\/\/\S+$/i.test(asset.url ?? "");

export const referenceCount = (assets: WorkshopAsset[]) =>
  assets.filter((asset) => canBeReference(asset) && asset.use_as_reference)
    .length;

/** Storage path for a file the user adds: ASCII only, unique by time. */
export function assetStoragePath(
  tenantId: string,
  itemId: string,
  fileName: string,
  now: number,
): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 50);
  return `${tenantId}/workshop/${itemId}/${now}_${base || "file"}${ext.replace(/[^a-z0-9.]/g, "")}`;
}

/** What the user typed into "add a link": a bare address gets https. */
export function normalizeLink(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}
