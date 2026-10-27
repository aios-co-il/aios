import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  isBlockedInWorkshop,
  stripServerOnlyPayloadKeys,
  workshopBlockedResult,
} from "./blocked-tools.ts";
import { ROLE_TOOLS, toolsForRole, type WorkshopRole } from "./roles.ts";
import { isWorkshopTool } from "./tool-definitions.ts";
import { NATIVE_DEV_TASK_TOOLS } from "../dev-escalation-auth.ts";

Deno.test("approval tools are blocked inside the workshop only", () => {
  for (const name of [
    "execute_pending_approval",
    "reject_pending_approval",
    "list_pending_approvals",
  ]) {
    assertStrictEquals(isBlockedInWorkshop(name, true), true);
    assertStrictEquals(isBlockedInWorkshop(name, false), false);
  }
});

Deno.test(
  "tools that act outside the board are blocked inside the workshop only",
  () => {
    for (const name of [
      // publishing
      "publish_social_post",
      "reply_to_social_comment",
      "create_meta_lead_form",
      // messages to people
      "send_message",
      "send_whatsapp_to_staff",
      "send_whatsapp_via_gateway",
      "send_broadcast_now",
      "send_calendar_invite",
      "join_meeting_for_client",
      "add_task_update",
      "manage_task_collaborators",
      // ads and budgets
      "toggle_facebook_campaign",
      "update_facebook_budget",
      "fb_create_ad",
      "fb_update_budget",
      "gads_update_budget",
      "schedule_campaign_toggle",
      // deletes and bulk edits
      "delete_lead",
      "batch_update_client_health",
      // generic work item edits
      "update_marketing_work_item",
      "handoff_marketing_work_item",
      // things that act later
      "create_agent_task",
      "propose_automation",
      "delegate_to_subagent",
      "delegate_parallel",
      "create_autonomous_goal",
      "create_execution_goal",
    ]) {
      assertStrictEquals(isBlockedInWorkshop(name, true), true, name);
      assertStrictEquals(isBlockedInWorkshop(name, false), false, name);
    }
  },
);

Deno.test(
  "workshop, read and helper tools stay allowed in the workshop",
  () => {
    for (const name of [
      "workshop_get_state",
      "workshop_make_creative",
      "search_agent_tools",
      "list_clients",
      "get_client_info",
      "list_social_pages",
      "list_facebook_campaigns",
      "get_marketing_work_item",
      "create_social_post",
      "generate_ad_image",
      "save_memory",
      "kb_search",
      "edit_scene",
      "render_video_film",
    ]) {
      assertStrictEquals(isBlockedInWorkshop(name, true), false, name);
    }
  },
);

Deno.test("connector (mcp_) tools are blocked inside the workshop only", () => {
  for (const name of [
    "mcp_Gmail__send_message",
    "mcp_WordPress__create_post",
    "mcp_Meta_Ads__update_campaign",
    "mcp_Supabase__execute_sql",
    "mcp_Claude__run_task",
  ]) {
    assertStrictEquals(isBlockedInWorkshop(name, true), true, name);
    assertStrictEquals(isBlockedInWorkshop(name, false), false, name);
  }
  assertMatch(
    workshopBlockedResult("mcp_Gmail__send_message").message,
    /לא שולחים הודעות/,
  );
});

Deno.test("a blocked call explains itself in Hebrew", () => {
  assertStrictEquals(
    workshopBlockedResult("execute_pending_approval").error,
    "not_in_workshop",
  );
  assertMatch(
    workshopBlockedResult("execute_pending_approval").message,
    /אישורים/,
  );
  assertMatch(
    workshopBlockedResult("publish_social_post").message,
    /לא מפרסמים/,
  );
});

Deno.test(
  "payload patches never carry the workshop budget or project state",
  () => {
    const { patch, dropped } = stripServerOnlyPayloadKeys({
      workshop_budget: { cap_ils: 99999, approved: true },
      workshop: { stage: "done" },
      notes: "ok",
    });
    assertEquals(patch, { notes: "ok" });
    assertEquals(dropped, ["workshop_budget", "workshop"]);
  },
);

Deno.test("an ordinary payload patch passes through unchanged", () => {
  const { patch, dropped } = stripServerOnlyPayloadKeys({
    notes: "x",
    channel: "facebook",
  });
  assertEquals(patch, { notes: "x", channel: "facebook" });
  assertEquals(dropped, []);
});

Deno.test(
  "Carmen's self-description and native dev-task tools stay offered in the workshop",
  () => {
    const kept = [
      "get_carmen_skins",
      "recall_skills",
      ...NATIVE_DEV_TASK_TOOLS,
    ];
    for (const name of kept)
      assertStrictEquals(isBlockedInWorkshop(name, true), false, name);
    const tools = [...kept, "workshop_start_project"].map((name) => ({ name }));
    for (const role of Object.keys(ROLE_TOOLS) as WorkshopRole[]) {
      const offered = toolsForRole(tools, role, isWorkshopTool).map(
        (t) => t.name,
      );
      for (const name of kept)
        assertStrictEquals(offered.includes(name), true, `${role}: ${name}`);
    }
  },
);

Deno.test(
  "coding-agent connectors and delegation stay blocked in the workshop",
  () => {
    for (const name of [
      "mcp_Cursor__request_dev_task",
      "mcp_Cursor__ask_cursor",
      "mcp_Claude__request_dev_task",
      "delegate_to_subagent",
      "delegate_parallel",
      "delegate_to_manus",
      "delegate_to_github_agent",
      "assign_task_to_cursor",
    ]) {
      assertStrictEquals(isBlockedInWorkshop(name, true), true, name);
      // Outside the workshop nothing changes.
      assertStrictEquals(isBlockedInWorkshop(name, false), false, name);
    }
  },
);
