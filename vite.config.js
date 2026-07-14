import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vercel serves the app from its domain root; GitHub Pages serves it from
  // /KeeperStat/. Vercel sets VERCEL=1 during its build, so branch on that.
  base: process.env.VERCEL ? "/" : "/KeeperStat/",
  test: {
    // api/_lib/db.js calls neon(process.env.DATABASE_URL) at module load
    // time, which throws if unset — neon() itself never connects until a
    // query actually runs, so a syntactically-valid placeholder is enough
    // to let tests import the file's pure row-to-JSON mappers.
    env: { DATABASE_URL: "postgres://user:pass@example.invalid/db" },
  },
  build: {
    // The vendor chunk below is dominated by the Neon Auth SDK and React
    // itself — both load on every screen (auth state is checked throughout
    // the app, not just on Login), so lazy-loading them would need a real
    // async-boundary refactor, not just a bundler config change. Splitting
    // app code out on its own is the safe, worthwhile win: it's now 118KB
    // and changes every deploy, while the ~600KB vendor chunk is stable
    // across deploys and caches in the browser instead of re-downloading.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("node_modules") ? "vendor" : undefined;
        },
      },
    },
  },
});
