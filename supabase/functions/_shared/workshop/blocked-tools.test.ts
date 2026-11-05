import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  isBlockedInWorkshop,
  stripServerOnlyPayloadKeys,
  workshopBlockedResult,
  workshopToolOffered,
  workshopToolRefusal,
} from "./blocked-tools.ts";
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
      "save_memory",
      "kb_search",
      "render_video_film",
    ]) {
      assertStrictEquals(isBlockedInWorkshop(name, true), false, name);
    }
  },
);

Deno.test(
  "paid tools outside the project budget are blocked inside the workshop only",
  () => {
    // A picture in the workshop is made by workshop_make_creative or workshop_make_stills, which
    // ask for the budget; the studio's own buttons have their own cost window, outside it.
    for (const name of ["generate_ad_image", "studio_ui_action"]) {
      assertStrictEquals(isBlockedInWorkshop(name, true), true, name);
      assertStrictEquals(isBlockedInWorkshop(name, false), false, name);
    }
    assertMatch(
      workshopBlockedResult("generate_ad_image").message,
      /workshop_make_creative/,
    );
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
    for (const name of kept)
      assertStrictEquals(workshopToolOffered(name, true), true, name);
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

Deno.test(
  "outside the workshop a workshop tool called by name does not run",
  () => {
    // Not offered outside the workshop (WhatsApp, other chats), and with no board to work on.
    for (const name of ["workshop_check_connections", "workshop_storyboard"]) {
      const refused = workshopToolRefusal(name, false);
      assertStrictEquals(refused?.error, "workshop_only", name);
      assertMatch(String(refused?.message), /בסדנה/);
      assertStrictEquals(workshopToolRefusal(name, true), null, name);
    }
    assertStrictEquals(workshopToolRefusal("list_clients", false), null);
    // In the workshop a tool that acts outside the board is still refused.
    assertEquals(
      workshopToolRefusal("publish_social_post", true),
      workshopBlockedResult("publish_social_post"),
    );
    assertStrictEquals(workshopToolRefusal("publish_social_post", false), null);
  },
);

Deno.test(
  "every workshop tool is offered on every workshop turn, and none outside it",
  () => {
    // On Staging the designer had no storyboard tool, so a picture could not become a film.
    for (const name of [
      "workshop_storyboard",
      "workshop_make_creative",
      "workshop_produce_video",
      "workshop_edit_from_assets",
    ]) {
      assertStrictEquals(workshopToolOffered(name, true), true, name);
      assertStrictEquals(workshopToolOffered(name, false), false, name);
    }
    assertStrictEquals(workshopToolOffered("mcp_Gmail__send", true), false);
    assertStrictEquals(workshopToolOffered("kb_search", false), true);
  },
);

Deno.test(
  "the old studio's scene tools are blocked in the workshop and point to its own tools",
  () => {
    for (const name of ["add_scene", "edit_scene", "delete_scene"]) {
      assertStrictEquals(isBlockedInWorkshop(name, true), true, name);
      assertStrictEquals(isBlockedInWorkshop(name, false), false, name);
      assertMatch(workshopBlockedResult(name).message, /workshop_storyboard/);
    }
  },
);
