export const DELIVERY_ENDPOINTS = {
  list: '/deliveries',
  byId: (id: string) => `/deliveries/${id}`,
  status: (id: string) => `/deliveries/${id}/status`,
  teachers: (id: string) => `/deliveries/${id}/teachers`,
  teacher: (id: string, teacherId: string) => `/deliveries/${id}/teachers/${teacherId}`,
  enrollments: (id: string) => `/deliveries/${id}/enrollments`,
  enrollment: (id: string, studentId: string) => `/deliveries/${id}/enrollments/${studentId}`,
} as const;
