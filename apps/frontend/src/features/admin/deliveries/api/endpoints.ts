export const DELIVERY_ENDPOINTS = {
  list: '/deliveries',
  byId: (id: string) => `/deliveries/${id}`,
  status: (id: string) => `/deliveries/${id}/status`,
} as const;
