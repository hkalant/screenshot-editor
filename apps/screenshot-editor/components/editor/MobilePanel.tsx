"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor";
import { MOBILE_PANEL_ID, MOBILE_PANELS, mobileTabId } from "./MobileTabs";

/**
 * The open tab's settings, docked under the canvas. It has a fixed height, so
 * the canvas above keeps its size while the user switches tabs.
 */
export function MobilePanel() {
  const mobilePanel = useEditorStore((state) => state.mobilePanel);
  const setMobilePanel = useEditorStore((state) => state.setMobilePanel);
  const headingId = useId();

  const panel = MOBILE_PANELS.find(({ id }) => id === mobilePanel);
  if (!panel) return null;
  const { id, label, Component } = panel;

  const close = () => {
    setMobilePanel(null);
    // The close button disappears with the panel; keep focus nearby.
    document.getElementById(mobileTabId(id))?.focus();
  };

  return (
    <section
      data-pane="side"
      id={MOBILE_PANEL_ID}
      aria-labelledby={headingId}
      className="flex h-[45dvh] shrink-0 flex-col border-t bg-background"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b pr-1 pl-4">
        <h2 id={headingId} className="text-sm font-semibold">
          {label}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          onClick={close}
          aria-label="Close panel"
          title="Close panel"
        >
          <X aria-hidden />
        </Button>
      </div>
      {/* Keyed by tab, so each tab opens at its top rather than at the
          previous tab's scroll position. */}
      <div
        key={id}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full max-w-lg p-4">
          <Component />
        </div>
      </div>
    </section>
  );
}
