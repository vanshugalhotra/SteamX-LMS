import type { AUTH_COOKIE_NAME } from '../auth.constants.js';

export type VerifiedToken = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

export type AuthCookieOptions = {
  name: typeof AUTH_COOKIE_NAME;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};
