import type { Json } from "@/integrations/supabase/types";
import { beforeEach, vi } from "vitest";

type Session = { user: { id: string }; access_token: string };

const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listener: null as null | ((event: string, session: Session | null) => void),
  getSession: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  invoke: vi.fn(),
  home: vi.fn(),
  toast: vi.fn(),
  unsubscribe: vi.fn(),
  invitationError: null as Error | null,
  invitation: null as null | {
    email: string;
    metadata: Json;
    tenants: { name: string } | null;
  },
}));

vi.mock("@/lib/appHomePath", () => ({ resolveAppHomePath: auth.home }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: auth.toast }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      getUser: auth.getUser,
      signInWithPassword: auth.signInWithPassword,
      signInWithOAuth: auth.signInWithOAuth,
      resetPasswordForEmail: auth.resetPasswordForEmail,
      updateUser: auth.updateUser,
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;

        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: auth.getAuthenticatorAssuranceLevel,
        listFactors: auth.listFactors,
        challenge: auth.challenge,
        verify: auth.verify,
      },
    },
    functions: { invoke: auth.invoke },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        maybeSingle: async () => ({
          data: auth.invitation,
          error: auth.invitationError,
        }),
      };

      return query;
    },
  },
}));

export const session = { user: { id: "user-id" }, access_token: "test-token" };

beforeEach(() => {
  vi.resetAllMocks();
  auth.session = null;
  auth.listener = null;
  auth.invitation = null;
  auth.invitationError = null;

  auth.getSession.mockImplementation(async () => ({
    data: { session: auth.session },
    error: null,
  }));
  auth.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  auth.home.mockResolvedValue("/t/test/home");

  auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  auth.listFactors.mockResolvedValue({
    data: { totp: [{ id: "factor-id" }] },
    error: null,
  });
  auth.challenge.mockResolvedValue({
    data: { id: "challenge-id" },
    error: null,
  });
  auth.verify.mockResolvedValue({ error: null });

  auth.invoke.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithPassword.mockImplementation(async () => {
    auth.session = session;
    auth.listener?.("SIGNED_IN", session);

    return { error: null };
  });
});

export { auth };
