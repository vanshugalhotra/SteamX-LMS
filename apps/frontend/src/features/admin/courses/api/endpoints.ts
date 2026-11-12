export const COURSE_ENDPOINTS = {
  list: '/courses',
  byId: (id: string) => `/courses/${id}`,
  status: (id: string) => `/courses/${id}/status`,
  outline: (id: string) => `/courses/${id}/outline`,
} as const;
