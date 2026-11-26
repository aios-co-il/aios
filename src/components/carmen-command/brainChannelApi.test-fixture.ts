// The stand-in for the brain channel API (brainChannelApi.ts) in sidecar
// tests: the brains the user may use, and every post the sidecar sent.
import {
  FALLBACK_BRAIN_ROUTES,
  type BrainRoute,
} from "@/lib/agentChannelRouting";

interface ChannelPost {
  action: string;
  brain_slug?: string;
  conversation_id?: string;
}

/** A model brain the user was granted, beside the built-in ones. */
export const modelBrain: BrainRoute = {
  id: "route-gpt",
  slug: "gpt-fast",
  label: "GPT",
  route_type: "model",
  provider: "model",
};

export const channel = {
  routes: [] as Array<BrainRoute>,
  /** Holds the brain list until the test releases it. */
  routesGate: Promise.resolve(),
  posts: [] as Array<ChannelPost>,
  postOk: true,
};

/** The built-in brains and the model brain, answered at once, posts accepted. */
export function resetChannel(): void {
  channel.routes = [...FALLBACK_BRAIN_ROUTES, modelBrain];
  channel.routesGate = Promise.resolve();
  channel.posts = [];
  channel.postOk = true;
}

export const fakeBrainChannelApi = {
  fetchBrainRoutes: async () => {
    await channel.routesGate;
    return { list: channel.routes, restricted: false };
  },
  fetchChannelHealth: async () => null,
  postChannel: async (body: ChannelPost) => {
    channel.posts.push(body);
    return {
      ok: channel.postOk,
      status: channel.postOk ? 200 : 403,
      json: {},
    };
  },
};
