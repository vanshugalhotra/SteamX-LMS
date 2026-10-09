export type VerifiedToken = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

export type AuthCookieOptions = {
  name: 'steamx_session';
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};
