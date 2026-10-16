const ADMIN_BASE = '/steamx/admin';

export const PATHS = {
  home: '/',
  login: '/login',
  changePassword: '/change-password',
  admin: {
    base: ADMIN_BASE,
    dashboard: `${ADMIN_BASE}/dashboard`,
  },
} as const;
