import { useEffect, useState } from "react";

export type StyleSnapshot = Record<string, string>;

export function useElementStyles(): Record<string, StyleSnapshot> {
  const [styles, setStyles] = useState<Record<string, StyleSnapshot>>({});

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.type !== "ae:styles" || typeof d.blockId !== "string") return;
      setStyles((prev) => ({ ...prev, [d.blockId]: { ...d.styles } }));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return styles;
}
