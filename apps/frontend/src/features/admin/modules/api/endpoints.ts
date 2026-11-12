export const COURSE_MODULE_ENDPOINTS = {
  byCourse: (courseId: string) => `/courses/${courseId}/modules`,
  reorder: (courseId: string) => `/courses/${courseId}/modules/order`,
  byId: (id: string) => `/modules/${id}`,
  status: (id: string) => `/modules/${id}/status`,
} as const;
