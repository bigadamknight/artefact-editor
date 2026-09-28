import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The timeline runs Studio's own components, which read these build-time
// switches. Vite also forwards VITE_* keys from process.env, so setting them
// here covers both the `define` rewrite and `import.meta.env` in dev.
process.env.VITE_HYPERFRAMES_NO_TELEMETRY = "1";
process.env.VITE_HYPERFRAMES_NO_FEEDBACK = "1";

export default defineConfig({
  base: "/timeline/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_HYPERFRAMES_NO_TELEMETRY": JSON.stringify("1"),
    "import.meta.env.VITE_HYPERFRAMES_NO_FEEDBACK": JSON.stringify("1"),
  },
  resolve: {
    // This workspace needs React 19; the rest of the repo is on 18. Yarn
    // still hoists 19 to the root node_modules, so pin one copy of each here.
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:7411",
    },
  },
});
