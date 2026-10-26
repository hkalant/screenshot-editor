"use client";

import { useSyncExternalStore } from "react";
import { canCaptureScreen } from "@/lib/image/capture";

const subscribe = () => () => {};

/**
 * Whether this browser can capture the screen (desktop browsers; not
 * phones). Meant for client-only components: during server rendering it
 * reports false.
 */
export function useCanCaptureScreen(): boolean {
  return useSyncExternalStore(subscribe, canCaptureScreen, () => false);
}
