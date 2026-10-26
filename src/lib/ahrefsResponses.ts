import type { Json } from "@/integrations/supabase/types";
import {
  asJsonObject,
  jsonObjects,
  readField,
  readNumber,
  readString,
} from "@/lib/jsonReaders";

export interface AhrefsSnapshotResponse {
  error?: string;
  tracked_count?: number;
  keywords_count?: number;
  projectId?: Json;
}

/** `fetch-ahrefs-snapshot` response body. */
export function readAhrefsSnapshotResponse(
  value: unknown,
): AhrefsSnapshotResponse {
  return {
    error: readString(value, "error"),
    tracked_count: readNumber(value, "tracked_count"),
    keywords_count: readNumber(value, "keywords_count"),
    projectId: readField(value, "projectId"),
  };
}

export interface AhrefsProject {
  project_id: string | number;
  project_name: string;
  url: string;
  domain: string;
  keyword_count?: number;
  mode?: string;
  protocol?: string;
}

function toAhrefsProject(row: {
  [key: string]: Json | undefined;
}): AhrefsProject[] {
  const id = row.project_id;
  if (typeof id !== "string" && typeof id !== "number") return [];
  return [
    {
      project_id: id,
      project_name: readString(row, "project_name") ?? "",
      url: readString(row, "url") ?? "",
      domain: readString(row, "domain") ?? "",
      keyword_count: readNumber(row, "keyword_count"),
      mode: readString(row, "mode"),
      protocol: readString(row, "protocol"),
    },
  ];
}

/** `list-ahrefs-projects` response body. */
export function readAhrefsProjectList(value: unknown): {
  error?: string;
  projects?: AhrefsProject[];
} {
  const body = asJsonObject(value);
  return {
    error: readString(body, "error"),
    projects:
      body.projects === undefined
        ? undefined
        : jsonObjects(body.projects).flatMap(toAhrefsProject),
  };
}
