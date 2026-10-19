export const SCHOOL_ENDPOINTS = {
  list: '/schools',
  byId: (id: string) => `/schools/${id}`,
  status: (id: string) => `/schools/${id}/status`,
} as const;
