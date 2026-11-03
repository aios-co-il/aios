import { z } from "zod";
import {
  isCopyDepartmentItem,
  isCreativeDepartmentItem,
} from "./departmentFilters";

import {
  copyPayloadSchema,
  type CopyPayload,
  type BriefFile,
} from "./copyPayloadSchema";
export type { CopyPayload, BriefFile, ChatTurn } from "./copyPayloadSchema";

/** Validate the stored copy fields while retaining unrelated persistence metadata. */
export function readCopyPayload(value: unknown): CopyPayload {
  const result = copyPayloadSchema.passthrough().safeParse(value ?? {});
  if (!result.success) {
    console.error("Invalid copy payload", {
      paths: result.error.issues.map((issue) => issue.path.join(".")),
    });
    throw new InvalidCopyPayloadError("נתוני הקופי אינם תקינים");
  }
  return result.data;
}

/** Decode a database row before exposing its payload to application code. */
export function readCopyWorkItem<T extends { payload: unknown }>(
  row: T,
): Omit<T, "payload"> & { payload: CopyPayload; hasStoryboard: boolean } {
  const metadata = z.object({ storyboard: z.unknown() }).passthrough();
  const raw = metadata.safeParse(row.payload ?? {});
  return {
    ...row,
    payload: readCopyPayload(row.payload),
    hasStoryboard: raw.success && Array.isArray(raw.data.storyboard),
  };
}

/** Filter raw workshop rows before validating the copy department's contract. */
export function readCopyDepartmentItems<
  T extends { payload: unknown; current_stage_id: string | null },
>(rows: Array<T>, copyStageIds: ReadonlySet<string>) {
  return readDepartmentItems(rows, copyStageIds, isCopyDepartmentItem);
}

/** Read only eligible creative siblings; unrelated departments cannot block a handoff. */
export function readCreativeHandoffItems<
  T extends {
    payload: unknown;
    current_stage_id: string | null;
    pipeline_id: string | null;
  },
>(
  rows: Array<T>,
  creativeStageIds: ReadonlySet<string>,
  socialPipelineIds: ReadonlySet<string>,
) {
  return readDepartmentItems(rows, creativeStageIds, (row, stageId) =>
    isCreativeDepartmentItem(row, stageId, socialPipelineIds),
  );
}

/** Normalize file references while retaining storage metadata outside known fields. */
export function filesFromAttachments(attachments: unknown): Array<BriefFile> {
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments.flatMap((file) => {
    const parsed = rawObjectSchema.safeParse(file);
    if (
      !parsed.success ||
      typeof parsed.data.name !== "string" ||
      !parsed.data.name
    ) {
      console.error("Invalid copy attachment");
      return [];
    }
    const rec = parsed.data;
    return [
      {
        ...rec,
        name: parsed.data.name,
        path: typeof rec.path === "string" ? rec.path : undefined,
        size: typeof rec.size === "number" ? rec.size : undefined,
        type: typeof rec.type === "string" ? rec.type : undefined,
      },
    ];
  });
}

/** Keep raw routing metadata at the boundary and isolate malformed eligible rows. */
function readDepartmentItems<
  T extends { payload: unknown; current_stage_id: string | null },
>(
  rows: Array<T>,
  stageIds: ReadonlySet<string>,
  matches: typeof isCopyDepartmentItem,
) {
  return rows.flatMap((row) => {
    const raw = rawObjectSchema.safeParse(row.payload ?? {});
    const stageId =
      row.current_stage_id && stageIds.has(row.current_stage_id)
        ? row.current_stage_id
        : undefined;
    if (!matches({ ...row, payload: raw.success ? raw.data : null }, stageId)) {
      return [];
    }
    try {
      return [readCopyWorkItem(row)];
    } catch (error: unknown) {
      if (!(error instanceof InvalidCopyPayloadError)) {
        throw error;
      }
      return [];
    }
  });
}

const rawObjectSchema = z.object({}).passthrough();
export class InvalidCopyPayloadError extends Error {}
