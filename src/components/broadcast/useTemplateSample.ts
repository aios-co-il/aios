import { useMemo } from "react";
import { useBroadcastLists } from "@/hooks/useBroadcastLists";
import {
  buildTemplateVars,
  type TemplateVars,
} from "../../../supabase/functions/_shared/broadcast-template.ts";
import { SAMPLE_VARS } from "./templateUtils";

/** Preview data for the template editor: the first member of the chosen
 * static list (or built-in sample vars) plus that list's custom columns. */
export function useTemplateSample(sampleListId: string | undefined) {
  const { lists, useMembers } = useBroadcastLists();
  const staticLists = (lists.data || []).filter((l) => l.kind === "static");
  const members = useMembers(sampleListId);
  const sampleMember = (members.data || [])[0];
  const customKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const m of members.data || [])
      for (const k of Object.keys(m.custom_fields || {})) keys.add(k);
    return [...keys];
  }, [members.data]);

  const previewVars: TemplateVars = sampleMember
    ? buildTemplateVars({
        contact_name: sampleMember.name,
        email: sampleMember.email,
        phone: sampleMember.phone,
        extra: sampleMember.custom_fields || {},
      })
    : SAMPLE_VARS;

  const sampleLabel = sampleMember
    ? ` · ${sampleMember.name || sampleMember.email || sampleMember.phone}`
    : " · נתוני דוגמה";

  return { staticLists, customKeys, previewVars, sampleLabel };
}
