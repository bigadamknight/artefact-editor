import { useEffect, useState } from "react";
import { ArtefactEditor, SpeechBubbleExport } from "@artefact-editor/editor";
import HomePage from "./pages/HomePage.js";
import { UpdateBanner } from "./components/UpdateBanner.js";

// Hash-based routing keeps the SPA lightweight: no history API plumbing on
// the static-file server. Routes:
//   #/             → home (project picker)
//   #/p/:id        → editor for a single project
//   #/export/:id   → headless bubble-overlay render for screenshotting
function parseHash(): { route: "home" | "editor" | "export"; projectId?: string } {
  const h = window.location.hash.replace(/^#/, "");
  const exportMatch = /^\/export\/([^/]+)$/.exec(h);
  if (exportMatch) return { route: "export", projectId: exportMatch[1] };
  const m = /^\/p\/([^/]+)$/.exec(h);
  if (m) return { route: "editor", projectId: m[1] };
  return { route: "home" };
}

export default function App() {
  const [hash, setHash] = useState(parseHash);

  useEffect(() => {
    const onChange = () => setHash(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  if (hash.route === "export" && hash.projectId) {
    // No UpdateBanner, no picker, no editor chrome — this route exists only
    // to be screenshotted headlessly.
    return <SpeechBubbleExport projectId={hash.projectId} />;
  }

  if (hash.route === "editor" && hash.projectId) {
    // Keying by projectId ensures fresh state (selection, transport, doc)
    // when navigating between projects via the home picker — otherwise the
    // inspector shows a stale selection that no longer maps to any block.
    return (
      <>
        <UpdateBanner />
        <ArtefactEditor
          key={hash.projectId}
          projectId={hash.projectId}
          onBack={() => {
            window.location.hash = "#/";
          }}
        />
      </>
    );
  }

  return (
    <>
      <UpdateBanner />
      <HomePage
        onOpen={(id) => {
          window.location.hash = `#/p/${id}`;
        }}
      />
    </>
  );
}
