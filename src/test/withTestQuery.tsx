import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren, ReactElement } from "react";

/** Wrap tested UI in a provider with its own query cache. */
export function withTestQuery(ui: ReactElement): ReactElement;
/** Expose the isolated client and provider for tests that need cache setup. */
export function withTestQuery(): TestQueryHarness;
/** Keep the provider's client stable for the lifetime of each test harness. */
export function withTestQuery(
  ui?: ReactElement,
): ReactElement | TestQueryHarness {
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

  return ui === undefined ? (
    { queryClient, wrapper: TestQueryProvider }
  ) : (
    <TestQueryProvider>{ui}</TestQueryProvider>
  );
}

type TestQueryHarness = {
  queryClient: QueryClient;
  wrapper: (props: PropsWithChildren) => ReactElement;
};
