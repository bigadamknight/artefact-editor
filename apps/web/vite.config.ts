import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      workbox: {
        // The service worker answers navigations with the cached editor
        // shell. Frames that load other documents must reach the server:
        // the timeline app, its composition preview (/api/.../preview) and
        // the artefact previews.
        navigateFallbackDenylist: [/^\/api\//, /^\/preview\//, /^\/timeline(\/|$)/],
      },
      manifest: {
        name: "Artefact Editor",
        short_name: "Artefact",
        description: "Edit AI-generated artefacts without round-tripping the agent.",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    // apps/timeline keeps React 19 in its own node_modules, but yarn can
    // still hoist a 19 copy to the root, where @artefact-editor/editor's
    // dist would find it. Resolve React from this app, always.
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:7411",
      "/preview": "http://localhost:7411",
      // The hyperframes timeline app (apps/timeline, Vite dev on 5174).
      "/timeline": { target: "http://localhost:5174", ws: true },
    },
  },
});
