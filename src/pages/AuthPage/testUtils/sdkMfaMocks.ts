import { createClient } from "@supabase/supabase-js";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { authResponse } from "./sdkMfaHarness";

const state = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  home: vi.fn<(userId: string) => Promise<string | null>>(),
  toast: vi.fn(),
  needsMfa: false,
  requests: [] as Array<Request>,
  events: [] as Array<string>,
}));

vi.mock("@/lib/appHomePath", () => ({ resolveAppHomePath: state.home }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://mfa.test", "test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

beforeEach(async () => {
  state.needsMfa = false;
  state.home.mockReset().mockResolvedValue("/t/test/home");
  state.toast.mockReset();
  state.events = [];
  state.fetch
    .mockReset()
    .mockImplementation((input, init) =>
      authResponse(input, init, state.needsMfa, state.requests),
    );
  await supabase.auth.signOut({ scope: "local" });
  state.requests = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

export { state };
