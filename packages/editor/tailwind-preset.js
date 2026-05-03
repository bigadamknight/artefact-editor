/**
 * Tailwind preset for @artefact-editor/editor.
 *
 * Host apps using the editor should add this preset to their tailwind config
 * and include the editor source in `content` so the utility classes used by
 * the editor get emitted. Example:
 *
 *   import editorPreset from "@artefact-editor/editor/tailwind-preset";
 *   export default {
 *     presets: [editorPreset],
 *     content: [
 *       "./index.html",
 *       "./src/**\/*.{ts,tsx}",
 *       "./node_modules/@artefact-editor/editor/dist/**\/*.js",
 *     ],
 *   };
 */
export default {
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222 47% 11%)",
        muted: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(215 16% 47%)",
        },
        accent: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222 47% 11%)",
        },
        primary: {
          DEFAULT: "hsl(222 47% 11%)",
          foreground: "hsl(210 40% 98%)",
        },
      },
    },
  },
  plugins: [],
};
