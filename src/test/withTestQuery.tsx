import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren, ReactElement } from "react";

/** Wrap tested UI in a provider with its own query cache. */
export function withTestQuery(ui: ReactElement): ReactElement {
  const { wrapper: TestQueryProvider } = createTestQueryHarness();
  return <TestQueryProvider>{ui}</TestQueryProvider>;
}

/** Legacy cache setup remains explicit until its callers migrate in AIO-339. */
export function createTestQueryHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  /** Rerenders share this harness's client without sharing another test's cache. */
  function TestQueryProvider({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, wrapper: TestQueryProvider };
}
