import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./ui/button.js";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update(), 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed left-1/2 top-3 z-50 flex w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-lg">
      <span className="text-sm text-muted-foreground">New version available</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Update
      </Button>
    </div>
  );
}
