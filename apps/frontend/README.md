# SteamX LMS: Frontend

React 19 + TypeScript + Vite single-page app.

**Stack:** Tailwind CSS v4, Base UI + class-variance-authority (shadcn-style components), React Router, TanStack Query, React Hook Form + Zod.

## Prerequisites

- Node (version from `.nvmrc`) and pnpm
- The backend running locally (see [apps/backend/README.md](../backend/README.md)). Pages that talk to the API, such as login, need it.

## Setup

From the repository root:

```bash
pnpm install
cp apps/frontend/.env.example apps/frontend/.env
```

`apps/frontend/.env`:

| Variable       | Example                 | Notes                                                                                                                              |
| -------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL` | `http://localhost:3000` | Backend origin only, **without** `/api/v1` (the prefix is added in `lib/api-client.ts`). Restart the dev server after changing it. |

## Run

```bash
pnpm --filter frontend dev
```

The app runs at <http://localhost:5173>.

## Scripts

Run from the repository root with `pnpm --filter frontend <script>`:

| Script      | What it does                       |
| ----------- | ---------------------------------- |
| `dev`       | Start the Vite dev server          |
| `lint`      | ESLint (type-aware)                |
| `typecheck` | `tsc -b`                           |
| `build`     | Type-check and production build    |
| `preview`   | Serve the production build locally |

## Trying the login page

Login needs the backend, a database and an admin user. One-time setup:

1. **Backend + database:** follow [apps/backend/README.md](../backend/README.md) (PostgreSQL databases, `apps/backend/.env`, `prisma:generate`).
2. **Auth secret** in `apps/backend/.env`. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```
   ```dotenv
   AUTH_JWT_SECRET=<generated value>
   ```
3. **Admin credentials** in `apps/backend/.env` (local dev only; never commit real values):
   ```dotenv
   ADMIN_STEAMX_ID=admin
   ADMIN_PASSWORD=<a strong password>
   ```
4. **Allowed origin:** the backend only accepts requests from allowed origins. Make sure `http://localhost:5173` is in its allowed-origins setting (see `apps/backend/.env.example`), otherwise requests fail with `403 ORIGIN_NOT_ALLOWED`.
5. **Migrate and create the admin** (from the repository root):
   ```bash
   pnpm --filter @steamx/backend migrate:deploy
   pnpm --filter @steamx/backend admin:create
   ```
6. **Start both apps** in two terminals:
   ```bash
   pnpm --filter @steamx/backend start:dev
   pnpm --filter frontend dev
   ```
7. Open <http://localhost:5173>, click **Login**, and sign in with `ADMIN_STEAMX_ID` and `ADMIN_PASSWORD`. The SteamX ID is case-insensitive.

### What to expect

- Empty submit shows field errors; wrong credentials show an error alert.
- A successful login sets an httpOnly session cookie and redirects to `/`.
- While signed in, opening `/login` redirects you away from it.
- The admin account created by `admin:create` must change its password on first login. Such a user is redirected to `/change-password` and cannot continue until the password is changed. After a successful change you land on `/`.

### Trying the forced password change

The admin you created has `mustChangePassword: true`, so the first login lands on `/change-password`. To test it again later, reset the admin (this also revokes existing sessions):

```bash
ADMIN_STEAMX_ID=admin ADMIN_PASSWORD='<a strong password>' pnpm --filter @steamx/backend admin:create --reset
```

(PowerShell: set `$env:ADMIN_STEAMX_ID` and `$env:ADMIN_PASSWORD` first.) The password must not contain the SteamX ID.

On `/change-password`:

- Empty fields and mismatched confirmation show field errors.
- A wrong current password or a password that breaks the policy shows an error alert (policy errors are listed).
- Success refetches the session and redirects to `/`.
- Signed-out users are redirected to `/login`; users who don't need to change their password are redirected to `/`.

## Project structure

```
src/
  app/          App wiring: providers, router
  components/   Shared UI (components/ui: Button, Input, PasswordInput, FormField, Alert)
  features/     One folder per feature (landing, auth, ...): pages, API calls, queries, schemas
  lib/          Shared helpers: api-client, env, query-client, utils
```

Conventions:

- Import with the `@/` alias (`@/lib/api-client`), not long relative paths.
- Call the backend through `apiFetch` in `lib/api-client.ts` (cookies are sent automatically). Pass `skipAuthHandlers: true` for calls where a 401 is an expected answer, so the global "session expired" redirect doesn't fire.
- Server state goes through TanStack Query; forms use React Hook Form with a Zod schema.
