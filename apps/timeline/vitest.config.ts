import { defineConfig } from "vitest/config";

// Studio's edit path parses the whole composition into a DOM; the
// composition's own scripts need the real runtime, so never run or fetch
// them. happy-dom 15 supports handleDisabledFileLoadingAsSuccess, but
// vitest 2's bundled option types predate it, hence the widened type.
const happyDOMSettings: Record<string, boolean> = {
  disableJavaScriptEvaluation: true,
  disableJavaScriptFileLoading: true,
  disableCSSFileLoading: true,
  handleDisabledFileLoadingAsSuccess: true,
};

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    environment: "happy-dom",
    environmentOptions: { happyDOM: { settings: happyDOMSettings } },
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
