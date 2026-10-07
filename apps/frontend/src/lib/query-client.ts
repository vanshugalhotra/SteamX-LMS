import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

const MAX_RETRIES = 2;

// 4xx errors that are temporary, so a retry can succeed
const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    const isClientError = error.status >= 400 && error.status < 500;
    if (isClientError && !RETRYABLE_CLIENT_STATUSES.has(error.status)) {
      return false;
    }
  }
  return failureCount < MAX_RETRIES;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
  },
});
