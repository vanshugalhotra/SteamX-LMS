export const DELIVERY_ENDPOINTS = {
  list: '/deliveries',
  byId: (id: string) => `/deliveries/${id}`,
  releases: (id: string) => `/deliveries/${id}/releases`,
} as const;
