# Frontend

React + TypeScript + Vite app for SteamX LMS.

## Requirements

- Node.js `>=24`
- pnpm

## Setup

From the repo root (pnpm workspace):

```bash
pnpm install
pnpm --filter frontend dev
```

The app runs at `http://localhost:5173`.

## Scripts

Run from the repo root with `pnpm --filter frontend <script>`, or from inside `apps/frontend` with `pnpm <script>`:

| Script      | Description                     |
| ----------- | ------------------------------- |
| `dev`       | Starts the dev server           |
| `build`     | Typecheck + production build    |
| `preview`   | Previews the production build   |
| `lint`      | Runs ESLint                     |
| `typecheck` | Runs `tsc -b` (type check only) |

## Environment Variables

No environment variables are required at the moment.

## Project Structure

```
apps/frontend
├── public/              # Static assets
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── eslint.config.js
├── tsconfig.json        # References tsconfig.app.json and tsconfig.node.json
├── tsconfig.app.json    # TS config for app source
└── tsconfig.node.json   # TS config for the Vite config
```
