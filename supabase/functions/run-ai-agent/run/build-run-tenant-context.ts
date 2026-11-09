import type { RunState } from "./state.ts";
import { shouldUseV2Prompt } from "../../_shared/carmen-prompt-v2.ts";
import { carmenPulseRulesVersion } from "../pulse-refresh/rules-block.ts";
import { agencyDataRulesVersion } from "../agency-data/rules-block.ts";
/** build Run Tenant Context in the original run order. */
export async function buildRunTenantContext(
  run: RunState,
): Promise<Response | string | void> {
  run.ownAgencyList = (run.agenciesRes.data || [])
    .map((a) => `${a.name} (${a.id})`)
    .join(", ");
  run.sharedAgencyList = run.sharedAgencies
    .map((a) => `${a.name} [משותפת מ-${a.source_tenant_name}] (${a.id})`)
    .join(", ");
  [run.leadsData, run.clientsData, run.tasksData] = run.statsRes;
  run.leadsByStatus = (run.leadsData.data || []).reduce<Record<string, number>>(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {},
  );
  const teamRoster = (run.teamRosterRes.data || []) as Array<{
    id: string;
    full_name: string;
    phone?: string | null;
    email?: string | null;
    role?: Array<string> | null;
  }>;
  const teamRosterLine =
    teamRoster.length > 0
      ? `\nצוות הארגון (${teamRoster.length} חברים):\n` +
        teamRoster
          .map((m) => {
            const parts = [
              m.full_name,
              m.phone ? `📱 ${m.phone}` : null,
              m.email ? `✉️ ${m.email}` : null,
              m.role?.length ? `(${m.role.join(", ")})` : null,
            ];
            return `• [${m.id}] ${parts.filter(Boolean).join(" | ")}`;
          })
          .join("\n")
      : "";
  run.tenantContext = [
    `ארגון: ${run.tenantName} (tenant_id: ${run.resolvedTenantId})`,
    run.ownAgencyList ? `סוכנויות שלנו: ${run.ownAgencyList}` : "",
    run.sharedAgencyList
      ? `סוכנויות משותפות (יש לנו גישה לדאטה שלהן): ${run.sharedAgencyList}`
      : "",
    run.sharedAgencies.length > 0
      ? `חשוב: יש לך גישה לקריאה/עדכון של לקוחות, לידים, משימות ושיחות מהסוכנויות המשותפות לעיל — גם אם הן שייכות לארגון אחר. כשמחפשים לקוח/ליד, חפשו גם בסוכנויות המשותפות.`
      : "",
    `לידים: ${run.leadsData.data?.length || 0} (${Object.entries(
      run.leadsByStatus,
    )
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")})`,
    `לקוחות פעילים: ${run.clientsData.count ?? 0}`,
    `משימות פתוחות: ${run.tasksData.count ?? 0}`,
    teamRosterLine,
  ]
    .filter(Boolean)
    .join("\n");
  run.isCarmen = run.isCarmenAgent;
  console.log(
    `[Carmen] agent=${run.agent.name} prompt_version=${shouldUseV2Prompt(run.agent) ? "v2" : "v1"} pulse_rules=${carmenPulseRulesVersion({ isCarmen: run.isCarmen, pinSkillsOnly: run.pinSkillsOnly })} agency_data_rules=${agencyDataRulesVersion({ isCarmen: run.isCarmen, pinSkillsOnly: run.pinSkillsOnly })}`,
  );
}
