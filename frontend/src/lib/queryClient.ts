import { QueryClient } from "@tanstack/react-query";

// Cấu hình QueryClient cho TanStack Query
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh for 5 mins
      cacheTime: 1000 * 60 * 10, // 10 minutes - cache lưu trong 10 mins
      retry: 1, // Retry 1 lần khi failed
      refetchOnWindowFocus: false, // Không refetch khi focus window
      refetchOnMount: true, // Refetch khi component mount
      refetchOnReconnect: true, // Refetch khi reconnect
    },
    mutations: {
      retry: 0, // Không retry mutations
    },
  },
});
