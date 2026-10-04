const SENSITIVE_FIELDS = ['password', 'token', 'refreshToken', 'secret'] as const;

export const REDACTED_LOG_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body',
  'res.body',
  ...SENSITIVE_FIELDS,
  ...SENSITIVE_FIELDS.map((field) => `*.${field}`),
];
