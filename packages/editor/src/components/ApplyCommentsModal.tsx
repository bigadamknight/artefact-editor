import { useState } from "react";
import type { ApplyCommentsResponse } from "@artefact-editor/contract";
import { Button } from "./ui/button.js";

interface ApplyCommentsModalProps {
  result: ApplyCommentsResponse;
  onClose: () => void;
}

export function ApplyCommentsModal({ result, onClose }: ApplyCommentsModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Apply comments — generated prompt</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </header>
        <p className="text-xs text-muted-foreground">
          Dry run — agent integration is not wired yet. Copy this prompt into Claude / your
          agent of choice and run it against the project root.
        </p>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed">
          {result.prompt}
        </pre>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
      </div>
    </div>
  );
}
