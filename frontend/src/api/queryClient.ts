import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERSIST_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (root !== "tasks") {
    return true;
  }

  const filter = queryKey[1];
  if (!filter || typeof filter !== "object") {
    return false;
  }

  const typedFilter = filter as {
    status?: unknown;
    forDate?: unknown;
    limit?: unknown;
  };

  if (typeof typedFilter.limit === "number" && typedFilter.limit >= 100) {
    return false;
  }

  const hasStatus = typeof typedFilter.status === "string";
  const hasForDate = typeof typedFilter.forDate === "string";

  return hasStatus || hasForDate;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: DAY_MS,
      retry: 2,
      networkMode: "offlineFirst",
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

if (typeof window !== "undefined") {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: "lazyflow-query-cache",
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: PERSIST_MAX_AGE_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => shouldPersistQueryKey(query.queryKey),
    },
  });
}
