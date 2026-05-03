import { useEffect, useState } from "react";

export function useSelection(): {
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
} {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; blockId?: string };
      if (data?.type === "ae:select" && typeof data.blockId === "string") {
        setSelectedBlockId(data.blockId);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return { selectedBlockId, setSelectedBlockId };
}
