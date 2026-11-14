export const SUBSCRIPTION_ENDPOINTS = {
  list: '/subscriptions',
  byId: (id: string) => `/subscriptions/${id}`,
  revoke: (id: string) => `/subscriptions/${id}/revoke`,
  renew: (id: string) => `/subscriptions/${id}/renew`,
} as const;
