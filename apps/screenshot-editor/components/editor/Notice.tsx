"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect } from "react";
import { useEditorStore } from "@/lib/store/editor";
import { cn } from "@/lib/utils";

const AUTO_HIDE_MS = { error: 8000, info: 3000 } as const;

/**
 * A short message at the bottom. On desktop it goes inside the canvas pane,
 * so it is centred under the canvas rather than the window; on mobile it
 * sits over the whole screen, clear of the tab bar.
 */
export function Notice({ inCanvas }: { inCanvas: boolean }) {
  const notice = useEditorStore((state) => state.notice);
  const dismissNotice = useEditorStore((state) => state.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismissNotice, AUTO_HIDE_MS[notice.kind]);
    return () => window.clearTimeout(timer);
  }, [notice, dismissNotice]);

  if (!notice) return null;
  const error = notice.kind === "error";
  const Icon = error ? CircleAlert : CircleCheck;
  return (
    <div
      key={notice.id}
      role={error ? "alert" : "status"}
      data-testid="notice"
      data-kind={notice.kind}
      className={cn(
        // Centred between 16px gutters. (Centring with left-1/2 would cap
        // the width at half the screen and wrap short messages on phones.)
        "inset-x-4 z-50 mx-auto flex w-fit items-center gap-3 rounded-lg pane-float py-2 pr-2 pl-4 text-sm",
        // 56px tab bar plus a 16px gap.
        inCanvas
          ? "absolute bottom-6"
          : "fixed bottom-[calc(env(safe-area-inset-bottom)+72px)]",
        error && "outline-2 outline-destructive",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          error ? "text-destructive" : "text-success",
        )}
        aria-hidden
      />
      <span>{notice.message}</span>
      <button
        type="button"
        onClick={dismissNotice}
        aria-label="Dismiss"
        className="rounded-sm p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid max-md:p-2.5"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
