import { useState } from "react";
import type { Command } from "@artefact-editor/core";
import type { ImageInpaintVersionView } from "@artefact-editor/contract";
import { apiPath, useEditorConfig } from "../config.js";

export interface ImageRegionPanelProps {
  projectId: string;
  blockId: string;
  hasMask: boolean;
  saving: boolean;
  versions: ImageInpaintVersionView[] | undefined;
  referenceImages: string[] | undefined;
  /** Called when the user hits Apply — child reads the current mask + posts. */
  onApply: (prompt: string, refImagePaths: string[]) => Promise<void>;
  onPromote: (cmd: Command) => Promise<void>;
}

export function ImageRegionPanel({
  projectId,
  blockId,
  hasMask,
  saving,
  versions,
  referenceImages,
  onApply,
  onPromote,
}: ImageRegionPanelProps) {
  const config = useEditorConfig();
  const [prompt, setPrompt] = useState("");
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());

  const canApply = !saving && hasMask && prompt.trim().length > 0;

  function toggleRef(path: string) {
    setSelectedRefs((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Edit prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder="Describe what to draw inside the masked area"
          className="mt-1 w-full resize-y rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>

      {referenceImages && referenceImages.length > 0 ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reference images
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {referenceImages.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => toggleRef(path)}
                className={`relative overflow-hidden rounded border-2 ${
                  selectedRefs.has(path) ? "border-primary" : "border-border"
                }`}
                title={path}
              >
                <img
                  src={
                    apiPath(config, `/projects/${projectId}/file?path=${encodeURIComponent(path)}`)
                  }
                  alt=""
                  className="h-16 w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canApply}
        onClick={() => void onApply(prompt.trim(), Array.from(selectedRefs))}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
      >
        {saving
          ? "Applying… (calling FAL, may take ~60s)"
          : !hasMask
            ? "Paint a mask first"
            : prompt.trim().length === 0
              ? "Type a prompt"
              : "Apply edit"}
      </button>

      <div className="border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History {versions && versions.length > 0 ? `(${versions.length})` : ""}
        </div>
        {versions && versions.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {[...versions].reverse().map((v) => (
              <li
                key={v.id}
                className="flex gap-3 rounded border border-border p-2"
              >
                <img
                  src={apiPath(
                    config,
                    `/projects/${projectId}/file?path=${encodeURIComponent(v.file)}`,
                  )}
                  alt=""
                  className="h-16 w-24 flex-shrink-0 rounded object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono">{v.id}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void onPromote({
                          type: "promoteImageVersion",
                          blockId,
                          versionId: v.id,
                        })
                      }
                      disabled={saving}
                      className="text-primary hover:underline disabled:opacity-40"
                      title="Restore the entry to this snapshot"
                    >
                      Revert to here
                    </button>
                  </div>
                  <div className="line-clamp-3 text-xs text-muted-foreground">{v.prompt}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">
            No edits yet. Each apply snapshots the previous state so you can revert.
          </div>
        )}
      </div>
    </div>
  );
}
