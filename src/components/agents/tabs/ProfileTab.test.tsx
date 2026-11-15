import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQuery } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import { ProfileTab } from "./ProfileTab";

const state = vi.hoisted(() => ({
  tenantId: "tenant-a",
  failure: false,
  reads: [] as Array<string>,
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

beforeEach(() => {
  state.failure = false;
  state.reads.length = 0;
  state.update.mockReset();
  state.success.mockReset();
  state.error.mockReset();
});

describe("ProfileTab immediate settings", () => {
  it.each([
    {
      field: "mood",
      label: "מצב הרוח הנוכחי",
      choice: /כיפי ומצחיק/,
      value: "fun",
      initial: null,
    },
    {
      field: "voice",
      label: "קול הסוכן",
      choice: /Nova/,
      value: "nova",
      initial: null,
    },
    {
      field: "mood",
      label: "מצב הרוח הנוכחי",
      choice: /ברירת מחדל/,
      value: null,
      initial: "fun",
    },
    {
      field: "voice",
      label: "קול הסוכן",
      choice: /ללא קול/,
      value: null,
      initial: "nova",
    },
  ])(
    "refreshes only the current tenant after saving $field",
    async (setting) => {
      const user = userEvent.setup();
      renderProfile({ ...agent, [setting.field]: setting.initial });
      await expectInitialLists();
      await user.click(settingSelector(setting.label));
      await user.click(
        await screen.findByRole("option", { name: setting.choice }),
      );

      await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
      expect(state.error).not.toHaveBeenCalled();
      expect(state.update).toHaveBeenCalledWith(
        "ai_agents",
        { [setting.field]: setting.value },
        "id",
        "agent-1",
      );
      await waitFor(() =>
        expect(state.reads.filter((id) => id === state.tenantId)).toHaveLength(
          2,
        ),
      );
      expect(state.reads.filter((id) => id === "other-tenant")).toHaveLength(1);
    },
  );

  it.each([
    { field: "mood", label: "מצב הרוח הנוכחי", choice: /כיפי ומצחיק/ },
    { field: "voice", label: "קול הסוכן", choice: /Nova/ },
  ])(
    "reports a failed $field save without refreshing or success",
    async (setting) => {
      state.failure = true;
      const user = userEvent.setup();
      renderProfile();
      await expectInitialLists();
      await user.click(settingSelector(setting.label));
      await user.click(
        await screen.findByRole("option", { name: setting.choice }),
      );

      await waitFor(() =>
        expect(state.error).toHaveBeenCalledWith("Save rejected"),
      );
      expect(state.success).not.toHaveBeenCalled();
      expect(state.reads).toHaveLength(2);
    },
  );
});

/** Mount the actual page and active lists to observe real query invalidation. */
function renderProfile(profile = agent) {
  render(
    withTestQuery(
      <>
        <AgentList tenantId={state.tenantId} />
        <AgentList tenantId="other-tenant" />
        <ProfileTab agent={profile} />
      </>,
    ),
  );
}

/** Locate the setting by its visible field label rather than page position. */
function settingSelector(label: string) {
  const field = screen.getByText(label).parentElement;
  if (!field) {
    throw new Error(`Missing setting field: ${label}`);
  }
  return within(field).getByRole("combobox");
}

/** Keep both tenants' lists active; only the saved tenant should refetch. */
function AgentList({ tenantId }: { tenantId: string }) {
  useQuery({
    queryKey: ["ai-agents", tenantId],
    queryFn: async () => {
      state.reads.push(tenantId);
      return tenantId;
    },
    staleTime: Infinity,
  });
  return null;
}

/** Wait for both initial cached lists before checking save-triggered refetches. */
async function expectInitialLists() {
  await waitFor(() => expect(state.reads).toHaveLength(2));
}

const agent: Tables<"ai_agents"> = {
  id: "agent-1",
  tenant_id: "tenant-a",
  name: "Agent",
  active: true,
  active_modes: null,
  active_skills: null,
  allowed_tools: null,
  brain_mode: "model",
  brain_route_id: null,
  is_carmen: false,
  created_at: null,
  description: null,
  disabled_integrations: null,
  disabled_skins: null,
  disabled_tools: null,
  engine: "openai",
  language: "he",
  max_tool_rounds: null,
  metadata: null,
  mood: null,
  personality: null,
  response_length: null,
  soul: null,
  system_prompt: null,
  talent: null,
  updated_at: null,
  voice: null,
  writing_style: null,
};

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: { mood?: string | null; voice?: string | null }) => ({
        eq: async (column: string, id: string) => {
          state.update(table, payload, column, id);
          return { error: state.failure ? { message: "Save rejected" } : null };
        },
      }),
    }),
  },
}));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));
vi.mock("../AgentVisualIdentity", () => ({ AgentVisualIdentity: () => null }));
vi.mock("../BrainSelector", () => ({ BrainSelector: () => null }));
vi.mock("@/hooks/useAgentGoals", () => ({
  useAgentGoals: () => ({ data: [] }),
}));
vi.mock("@/hooks/useAgentKnowledge", () => ({
  useAgentKnowledge: () => ({ folders: { data: [] }, items: { data: [] } }),
}));
vi.mock("@/hooks/useAgentMemory", () => ({
  useAgentMemoryTree: () => ({ data: [] }),
  useCarmenMemoryTree: () => ({ data: { tree: [], episodesCount: 0 } }),
}));
