"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Where the editor switches from the mobile layout to the desktop one. */
export const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Whether a CSS media query matches, updated live. Meant for client-only
 * components (the editor): during server rendering it reports false.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      // WebKit can miss a change when the window is resized quickly, and the
      // layout would then stay as it was; a resize checks again.
      window.addEventListener("resize", onChange);
      return () => {
        list.removeEventListener("change", onChange);
        window.removeEventListener("resize", onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
