export const DELIVERY_ENDPOINTS = {
  list: '/deliveries',
  byId: (id: string) => `/deliveries/${id}`,
  releases: (id: string) => `/deliveries/${id}/releases`,
  releaseLesson: (id: string, lessonId: string) => `/deliveries/${id}/releases/lessons/${lessonId}`,
  releaseModule: (id: string, moduleId: string) => `/deliveries/${id}/releases/modules/${moduleId}`,
} as const;
