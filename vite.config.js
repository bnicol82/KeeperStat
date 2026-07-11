import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vercel serves the app from its domain root; GitHub Pages serves it from
  // /KeeperStat/. Vercel sets VERCEL=1 during its build, so branch on that.
  base: process.env.VERCEL ? "/" : "/KeeperStat/",
});
