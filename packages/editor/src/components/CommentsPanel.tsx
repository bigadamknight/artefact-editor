import type { Block, Comment } from "@artefact-editor/core";
import { Button } from "./ui/button.js";

interface CommentsPanelProps {
  comments: Comment[];
  blocks: Block[];
  onSelectBlock: (blockId: string) => void;
  onDelete: (commentId: string) => void;
  onApply: () => void;
  applying?: boolean;
}

export function CommentsPanel({
  comments,
  blocks,
  onSelectBlock,
  onDelete,
  onApply,
  applying,
}: CommentsPanelProps) {
  const pending = comments.filter((c) => c.status === "pending");
  const blocksById = new Map(blocks.map((b) => [b.id, b]));

  if (pending.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        No comments. Toggle Comment mode and click a block in the preview to leave one.
      </div>
    );
  }

  return (
    <div className="space-y-2 px-2 py-2">
      {pending.map((c) => {
        const block = blocksById.get(c.blockId);
        return (
          <div
            key={c.id}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs"
          >
            <div className="flex items-baseline justify-between gap-2">
              <button
                type="button"
                onClick={() => onSelectBlock(c.blockId)}
                className="truncate font-semibold hover:underline"
                title="Select this block"
              >
                {block?.label ?? c.blockId}
              </button>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Dismiss comment"
              >
                ×
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-foreground">{c.text}</p>
          </div>
        );
      })}
      <div className="px-1 pt-1">
        <Button size="sm" className="w-full" onClick={onApply} disabled={applying}>
          {applying ? "Generating…" : `Apply ${pending.length} comment${pending.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
