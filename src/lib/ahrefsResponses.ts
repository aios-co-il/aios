import { z } from "zod";
import { jsonValueSchema, listOf } from "@/lib/jsonReaders";

const optionalString = z.string().optional().catch(undefined);
const optionalNumber = z.number().optional().catch(undefined);

const ahrefsSnapshotResponseSchema = z
  .object({
    error: optionalString,
    tracked_count: optionalNumber,
    keywords_count: optionalNumber,
    projectId: jsonValueSchema.optional(),
  })
  .catch({});

export type AhrefsSnapshotResponse = z.infer<
  typeof ahrefsSnapshotResponseSchema
>;

/** `fetch-ahrefs-snapshot` response body. */
export function readAhrefsSnapshotResponse(
  value: unknown,
): AhrefsSnapshotResponse {
  return ahrefsSnapshotResponseSchema.parse(value);
}

const ahrefsProjectSchema = z.object({
  project_id: z.union([z.string(), z.number()]),
  project_name: z.string().catch(""),
  url: z.string().catch(""),
  domain: z.string().catch(""),
  keyword_count: optionalNumber,
  mode: optionalString,
  protocol: optionalString,
});

export type AhrefsProject = z.infer<typeof ahrefsProjectSchema>;

const ahrefsProjectListSchema = z
  .object({
    error: optionalString,
    projects: listOf(ahrefsProjectSchema).optional(),
  })
  .catch({});

/** `list-ahrefs-projects` response body. */
export function readAhrefsProjectList(value: unknown): {
  error?: string;
  projects?: AhrefsProject[];
} {
  return ahrefsProjectListSchema.parse(value);
}
