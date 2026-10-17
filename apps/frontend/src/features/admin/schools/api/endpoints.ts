export const SCHOOL_ENDPOINTS = {
  list: '/schools',
  byId: (id: string) => `/schools/${id}`,
} as const;
