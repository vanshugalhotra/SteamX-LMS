export const LESSON_ENDPOINTS = {
  byModule: (moduleId: string) => `/modules/${moduleId}/lessons`,
  reorder: (moduleId: string) => `/modules/${moduleId}/lessons/order`,
  byId: (id: string) => `/lessons/${id}`,
  status: (id: string) => `/lessons/${id}/status`,
  content: (id: string) => `/lessons/${id}/content`,
} as const;
