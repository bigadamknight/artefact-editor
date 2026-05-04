import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button.js";
import { Textarea } from "./ui/textarea.js";

interface CommentComposerProps {
  blockLabel: string;
  blockId: string;
  onSubmit: (text: string) => Promise<void> | void;
  onCancel: () => void;
}

export function CommentComposer({ blockLabel, blockId, onSubmit, onCancel }: CommentComposerProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold">Comment on {blockLabel}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{blockId}</div>
      </div>
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. punchier, mention the 14-day trial"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!text.trim() || submitting} onClick={() => void submit()}>
          {submitting ? "Saving…" : "Add comment"}
        </Button>
      </div>
    </div>
  );
}
