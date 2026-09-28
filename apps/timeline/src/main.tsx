import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@hyperframes/studio/styles.css";
import "./theme.css";
import { TimelinePage } from "./pages/TimelinePage";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <TimelinePage />
  </StrictMode>,
);
