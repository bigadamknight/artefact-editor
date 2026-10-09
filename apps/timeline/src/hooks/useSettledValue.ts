import { useEffect, useState } from "react";

/**
 * `value`, once it has stopped changing for `delayMs`. Used for values that
 * drive server work, so a scrub produces one request instead of one per step.
 */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(setSettled, delayMs, value);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
