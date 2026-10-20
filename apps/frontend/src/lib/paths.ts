const ADMIN_BASE = '/steamx/admin';

export const PATHS = {
  home: '/',
  login: '/login',
  changePassword: '/change-password',
  admin: {
    base: ADMIN_BASE,
    dashboard: `${ADMIN_BASE}/dashboard`,
    schools: `${ADMIN_BASE}/schools`,
    schoolNew: `${ADMIN_BASE}/schools/new`,
    schoolEdit: (id: string) => `${ADMIN_BASE}/schools/${id}/edit`,
  },
} as const;
