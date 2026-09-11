"use client";

import { useCallback, useRef, useState } from "react";

// Guards a mutating action (API call) against spam/double-clicks. A
// useState-only `disabled` flag has a real race window: React doesn't
// actually repaint the disabled attribute until it re-renders, which can lag
// behind a very fast double-click (or a script firing clicks faster than a
// frame). This closes that window with a synchronous useRef check, which
// takes effect immediately - same pattern the login page's sign-in button
// already used, now shared so every mutating button in the app gets it.
//
// Server-side concurrency guards (atomic conditional updates) already make a
// duplicate request harmless in most cases here - this is about not wasting
// real cost (an extra Claude call from double-clicking Submit/Regenerate) or
// confusing the user with two in-flight requests, not about data safety.
export function useGuardedAction() {
  const runningRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
