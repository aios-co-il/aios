import { useState, useEffect } from "react";
import type { FolderLink } from "@/components/forms/FolderLinksField";
import type { Attachment } from "@/components/forms/AttachmentsField";
import { isJsonObject } from "@/lib/typing-b26";

interface EntityWithFiles {
  folder_links?: unknown;
  folder_link?: string;
  attachments?: unknown;
}

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

function toFolderLinks(value: unknown): FolderLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isJsonObject).map((item) => ({
    ...item,
    name: optionalString(item.name) ?? "",
    url: optionalString(item.url) ?? "",
  }));
}

function toAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isJsonObject).map((item) => ({
    ...item,
    name: optionalString(item.name) ?? "",
    type: optionalString(item.type) ?? "",
    path: optionalString(item.path),
    url: optionalString(item.url),
    size: typeof item.size === "number" ? item.size : undefined,
    uploaded_at: optionalString(item.uploaded_at),
    created_at: optionalString(item.created_at),
    created_by: optionalString(item.created_by),
  }));
}

/**
 * Hook לניהול folder_links ו-attachments של ליד או לקוח
 * מטפל בפרסור של הנתונים מהדאטהבייס ומחזיר מצב מנוהל
 */
export function useFolderLinksAndAttachments(entity: EntityWithFiles) {
  const [folderLinks, setFolderLinks] = useState<FolderLink[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    // Parse folder_links
    if (entity?.folder_links) {
      try {
        const parsed: unknown =
          typeof entity.folder_links === "string"
            ? JSON.parse(entity.folder_links)
            : entity.folder_links;
        setFolderLinks(toFolderLinks(parsed));
      } catch {
        // Fallback to old folder_link field
        if (entity.folder_link) {
          setFolderLinks([{ name: "קישור", url: entity.folder_link }]);
        } else {
          setFolderLinks([]);
        }
      }
    } else if (entity?.folder_link) {
      setFolderLinks([{ name: "קישור", url: entity.folder_link }]);
    } else {
      setFolderLinks([]);
    }

    // Parse attachments
    if (entity?.attachments) {
      try {
        const parsed: unknown =
          typeof entity.attachments === "string"
            ? JSON.parse(entity.attachments)
            : entity.attachments;
        setAttachments(toAttachments(parsed));
      } catch {
        setAttachments([]);
      }
    } else {
      setAttachments([]);
    }
    // Use JSON.stringify to detect actual data changes, not just reference changes
  }, [
    JSON.stringify(entity?.folder_links),
    JSON.stringify(entity?.attachments),
    entity?.folder_link,
  ]);

  return {
    folderLinks,
    setFolderLinks,
    attachments,
    setAttachments,
    filesCount: folderLinks.length + attachments.length,
  };
}
