# KeeperStat

A stat-tracking PWA for youth soccer goalkeepers — live match tracking, a season-long GK Impact Score, per-match reports, training recommendations, and an in-app public leaderboard.

## Stack

- **Frontend**: React 19 + Vite, a single-file app shell (`src/App.jsx`) with in-app screen state rather than a router.
- **Backend**: Vercel serverless functions (`api/`), talking to Neon Postgres via `@neondatabase/serverless`.
- **Auth**: Neon Auth (`@neondatabase/auth`, wrapping Better Auth) — email/password only. `api/_lib/auth.js` validates the bearer token by querying `neon_auth.session` directly rather than using cookie-based session lookup, since iOS Safari's cross-site cookie blocking breaks that under "Add to Home Screen."
- **Storage**: Vercel Blob for keeper photos.
- **Deploys**: GitHub Pages is the canonical frontend (`.github/workflows/deploy.yml`); Vercel also builds and serves a working copy of the same frontend plus the `/api` functions.

## Demo mode vs. real accounts

The app has two entry points: **Demo** runs entirely against an in-memory, throwaway mock (`src/demoApi.js`) and never touches the network — good for trying the app or for local UI work. **Log In** creates a real Neon Auth account backed by Postgres (`src/api.js`). The two are intentionally kept separate; a change to backend/API behavior won't be exercised by demo mode.

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, VITE_API_BASE_URL, VITE_NEON_AUTH_URL
npm run dev
```

Demo mode works with no environment variables at all. Real accounts need `DATABASE_URL` (for the API) and `VITE_NEON_AUTH_URL` (for the frontend's auth client) pointed at a real Neon project.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build (`dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the vitest suite |
| `npm run db:migrate` | Apply `db/migrations/*.sql` to `DATABASE_URL`, tracked in a `_migrations` table so it's safe to re-run |

## Architecture notes

- **`shared/scoring.js`** is the single source of truth for the GK Impact Score formula (goals prevented vs. a level-of-play baseline) — imported by both the frontend and `api/rankings.js` so a keeper's own score always matches what the leaderboard computes for the same matches.
- **`api/_lib/`** holds cross-route helpers: `db.js` (the `sql` client, CORS, row-to-JSON mappers), `auth.js` (bearer token → user id), `validate.js` (dependency-free request-body validators), `errors.js` (wraps every route handler so an unhandled error returns a clean 500 instead of a raw stack trace), `rateLimit.js` (a Postgres-backed fixed-window limiter, since serverless invocations don't share memory).
- **`db/migrations/`** is a plain numbered SQL migration set (no ORM), applied by `db/migrate.js`. A GitHub Action (`neon-preview.yml`) spins up an ephemeral Neon branch per PR and runs migrations against it automatically.
- Vite's `manualChunks` (in `vite.config.js`) splits third-party dependencies into their own `vendor` chunk, separate from app code — the dependency tree (React, the auth SDK) is stable across deploys and caches in the browser, while app code is small and changes every deploy.

## CI

- `.github/workflows/ci.yml` runs `npm test` and `npm run build` on every pull request.
- `.github/workflows/deploy.yml` runs the same gate before deploying `main` to GitHub Pages.
- `.github/workflows/neon-preview.yml` creates/tears down a Neon branch per PR and runs migrations against it.

Note: these give visible pass/fail checks, but don't themselves block a merge on a red check — that requires enabling "require status checks to pass" under the repo's branch protection settings.
