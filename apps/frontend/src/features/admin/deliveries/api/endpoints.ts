export const DELIVERY_ENDPOINTS = {
  list: '/deliveries',
  byId: (id: string) => `/deliveries/${id}`,
  status: (id: string) => `/deliveries/${id}/status`,
  teachers: (id: string) => `/deliveries/${id}/teachers`,
  teacher: (id: string, teacherId: string) => `/deliveries/${id}/teachers/${teacherId}`,
  enrollments: (id: string) => `/deliveries/${id}/enrollments`,
  enrollment: (id: string, studentId: string) => `/deliveries/${id}/enrollments/${studentId}`,
  releases: (id: string) => `/deliveries/${id}/releases`,
  releaseLesson: (id: string, lessonId: string) => `/deliveries/${id}/releases/lessons/${lessonId}`,
  releaseModule: (id: string, moduleId: string) => `/deliveries/${id}/releases/modules/${moduleId}`,
} as const;
