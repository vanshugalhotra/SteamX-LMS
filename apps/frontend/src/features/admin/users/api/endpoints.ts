export const USER_ENDPOINTS = {
  list: '/users',
  teachers: '/users/teachers',
  students: '/users/students',
  byId: (id: string) => `/users/${id}`,
  status: (id: string) => `/users/${id}/status`,
} as const;
