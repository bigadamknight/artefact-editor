import { useEffect, useState } from "react";
import { loadOverlayFonts } from "../components/speechBubbleDraw.js";

/** True once the overlay fonts are loaded, so text can be measured and wrapped. */
export function useOverlayFontsLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadOverlayFonts()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return loaded;
}
