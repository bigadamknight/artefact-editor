import { useEffect, useState } from "react";
import EditorPage from "./pages/EditorPage.js";
import HomePage from "./pages/HomePage.js";

// Hash-based routing keeps the SPA lightweight: no history API plumbing on
// the static-file server. Routes:
//   #/        → home (project picker)
//   #/p/:id   → editor for a single project
function parseHash(): { route: "home" | "editor"; projectId?: string } {
  const h = window.location.hash.replace(/^#/, "");
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

  if (hash.route === "editor" && hash.projectId) {
    return (
      <EditorPage
        projectId={hash.projectId}
        onBack={() => {
          window.location.hash = "#/";
        }}
      />
    );
  }

  return (
    <HomePage
      onOpen={(id) => {
        window.location.hash = `#/p/${id}`;
      }}
    />
  );
}
