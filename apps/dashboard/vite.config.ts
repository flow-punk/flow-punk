import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// SPA build → served by a Worker via Cloudflare Workers Assets per ADR-016.
// SSR via TanStack Start + Nitro Cloudflare preset is the planned follow-up
// (the package surface is structured so the entry can be swapped without
// touching modules or app composition).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
