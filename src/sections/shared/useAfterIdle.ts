import { useEffect, useState } from "react";

/**
 * Runs `compute` once after hydration, when the browser is idle, and returns its result (null until then).
 * Keeps first-use Intl setup (hundreds of ms on slow phones) out of the hydration task.
 * shortcut: compute runs once, so it must not depend on props that change; make it a dependency if one ever does.
 */
export function useAfterIdle<T>(compute: () => T): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    const run = () => setValue(compute());
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compute is deliberately read once; see shortcut above.
  }, []);
  return value;
}
