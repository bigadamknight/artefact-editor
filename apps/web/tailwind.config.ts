import type { Config } from "tailwindcss";
import editorPreset from "@artefact-editor/editor/tailwind-preset";

export default {
  presets: [editorPreset as Config],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/editor/dist/**/*.js",
  ],
} satisfies Config;
