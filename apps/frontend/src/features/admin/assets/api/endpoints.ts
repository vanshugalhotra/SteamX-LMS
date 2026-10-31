export const ASSET_ENDPOINTS = {
  list: '/assets',
  byId: (id: string) => `/assets/${id}`,
  access: (id: string) => `/assets/${id}/access`,
  status: (id: string) => `/assets/${id}/status`,
  files: (id: string) => `/assets/${id}/files`,
  file: (id: string, fileId: string) => `/assets/${id}/files/${fileId}`,
  complete: (id: string, fileId: string) => `/assets/${id}/files/${fileId}/complete`,
} as const;
