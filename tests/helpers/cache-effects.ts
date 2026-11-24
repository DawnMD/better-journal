import {
  MutationObserver,
  QueryObserver,
  type QueryClient,
} from "@tanstack/react-query";

/**
 * Drives cache effects the way the app triggers them: a mutation built from the
 * real oRPC `mutationOptions` (so its real mutation key) runs on the app's real
 * QueryClient, and the central mutation-cache hook does the rest. Only the
 * network is replaced — `mutationFn` returns what the procedure would.
 */

/** Runs a mutation through the query client as `useMutation` would. */
export async function run<TData, TVariables>(
  queryClient: QueryClient,
  options: { mutationKey?: readonly unknown[] },
  variables: TVariables,
  response: TData,
) {
  const observer = new MutationObserver<TData, Error, TVariables>(queryClient, {
    ...options,
    mutationFn: async () => response,
  });
  await observer.mutate(variables);
}

export const state = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.getQueryState(queryKey);

/**
 * Mounts an observer on a seeded entry, as an open screen would, and counts the
 * network requests it makes — so "staled without refetching" is observable.
 */
export function watch(queryClient: QueryClient, queryKey: readonly unknown[]) {
  let fetches = 0;
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn: async () => {
      fetches += 1;
      return queryClient.getQueryData(queryKey) ?? null;
    },
  });
  observer.subscribe(() => {});

  return { fetches: () => fetches };
}
