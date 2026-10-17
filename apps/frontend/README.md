# SteamX LMS: Frontend

React 19 + TypeScript + Vite single-page app.

**Stack:** Tailwind CSS v4, Base UI + class-variance-authority (shadcn-style components), React Router, TanStack Query, React Hook Form + Zod, Sonner (toasts), Lucide (icons).

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
- A successful login sets an httpOnly session cookie and redirects to `/steamx/admin/dashboard`.
- While signed in, opening `/login` redirects you away from it.
- The admin account created by `admin:create` must change its password on first login. Such a user is redirected to `/change-password` and cannot continue until the password is changed. After a successful change you land on `/steamx/admin/dashboard`.
- When a protected API call returns 401, you are sent to `/login` with a "session expired" message (verified once a feature calls a protected endpoint).

### Trying the forced password change

The admin you created has `mustChangePassword: true`, so the first login lands on `/change-password`. To reset the admin and try it again, follow the runbook in [docs/runbooks/admin-recovery.md](../../docs/runbooks/admin-recovery.md).

On `/change-password`:

- Empty fields and mismatched confirmation show field errors.
- A wrong current password or a password that breaks the policy shows an error alert (policy errors are listed).
- Success updates the session and redirects to `/steamx/admin/dashboard`.
- Signed-out users are redirected to `/login`; users who don't need to change their password are redirected to `/steamx/admin/dashboard`.

### Trying the admin shell and session management

Signing in lands on the admin shell at `/steamx/admin/dashboard` (sidebar, header and the page content).

- Sign in, refresh the page: you stay signed in (the session is restored from `/auth/me`).
- Open `/steamx/admin/dashboard` while signed out: you are redirected to `/login`.
- Click **Sign out** (in the sidebar; top right on mobile): the session cookie is cleared, the cache is dropped and you land on `/login`.
- A user who must change their password is redirected to `/change-password` from every admin route.
- Desktop: the sidebar groups (People, Content, Billing) can be collapsed; the group containing the current page stays open. Mobile: the navigation is one horizontally scrollable row.
- Navigation items whose page does not exist yet are shown disabled.

The global 401/403 handlers (`app/session-handlers.ts`) only run for API calls made without `skipAuthHandlers`. No page makes such a call yet, so the "session expired" message and the "no access" toast cannot be triggered from the UI until a feature calls a protected endpoint.

### Trying the schools page

Open **Schools** in the sidebar (`/steamx/admin/schools`). The signed-in admin needs the `school.read` permission (and `school.manage` to create or edit); both are granted to the admin role by the backend migrations.

- The list loads from `GET /schools`. Search (by name or code, debounced), the status filter (All, Active, Inactive) and pagination are handled by the API.
- **Add school** opens a drawer. Empty required fields show field errors; a duplicate school code is shown on the code field.
- **Edit** opens the same drawer. The code cannot be changed, and clearing an optional field saves it as empty.
- Esc, the close button or a click on the backdrop closes the drawer and returns focus to the button that opened it.
- If the list cannot be loaded, an error with a **Retry** button is shown.

If the list returns `403` (missing `school.read`), your local database probably has an older version of the `reference_data` migration applied. Reset the dev database (`prisma migrate reset` in `apps/backend`, which wipes local data) and run `admin:create` again.

## Project structure

```
src/
  app/          App wiring: providers, router, session handlers
  components/   Shared UI (components/ui: Button, Input, PasswordInput, FormField, Alert, Drawer, Pagination), Logo
  features/     One folder per feature (landing, auth, admin, ...)
    auth/       api/, pages/, model/, components/, queries.ts, loaders.ts
    admin/      components/ (layout, sidebar, header), pages/, nav.ts
      schools/  api/, model/, components/, pages/, queries.ts
  lib/          Shared helpers: api-client, env, query-client, paths, pagination, use-debounced-value, utils
```

Conventions:

- Import with the `@/` alias (`@/lib/api-client`), not long relative paths.
- Call the backend through `apiFetch` in `lib/api-client.ts` (cookies are sent automatically). Pass `skipAuthHandlers: true` for calls where a 401 is an expected answer, so the global "session expired" redirect doesn't fire.
- Server state goes through TanStack Query; forms use React Hook Form with a Zod schema.
- All route paths live in `lib/paths.ts` (`PATHS`). Admin routes are prefixed with `/steamx/admin`. Don't hardcode paths in components.
- Global 401/403 handling lives in `app/session-handlers.ts`, registered once in `main.tsx`.
- List endpoints return `{ items, page, limit, total }` (the `Paginated<T>` type in `lib/pagination.ts`). Filtering, search and paging are done by the API, and query keys per feature live in its `queries.ts`.
