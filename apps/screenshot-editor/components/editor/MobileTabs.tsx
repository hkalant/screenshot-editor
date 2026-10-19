"use client";

import { Ruler } from "lucide-react";
import type { ComponentType } from "react";
import type { MobilePanelId } from "@/lib/store/editor";
import { useEditorStore } from "@/lib/store/editor";
import { PANELS } from "./panels/registry";
import { SizeOptions } from "./topbar/SizeMenu";

/** The rail's panels plus Size, which lives in the top bar on desktop. */
export const MOBILE_PANELS: readonly {
  id: MobilePanelId;
  label: string;
  icon: typeof Ruler;
  Component: ComponentType;
}[] = [
  ...PANELS,
  { id: "size", label: "Size", icon: Ruler, Component: SizeOptions },
];

export const MOBILE_PANEL_ID = "mobile-panel";
export const mobileTabId = (id: MobilePanelId) => `mobile-tab-${id}`;

/** The bottom tab bar of the mobile layout. Tapping the open tab closes its panel. */
export function MobileTabs() {
  const mobilePanel = useEditorStore((state) => state.mobilePanel);
  const setMobilePanel = useEditorStore((state) => state.setMobilePanel);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);

  const toggle = (id: MobilePanelId) => {
    if (mobilePanel === id) {
      setMobilePanel(null);
      return;
    }
    setMobilePanel(id);
    // Keep the desktop rail on the same panel, for when the window widens.
    if (id !== "size") setActivePanel(id);
  };

  return (
    <nav
      data-pane="side"
      aria-label="Tools"
      className="shrink-0 border-t bg-background pb-(--safe-area-bottom)"
    >
      <div className="flex px-1">
        {MOBILE_PANELS.map(({ id, label, icon: Icon }) => {
          const open = mobilePanel === id;
          return (
            <button
              key={id}
              id={mobileTabId(id)}
              type="button"
              aria-pressed={open}
              aria-controls={open ? MOBILE_PANEL_ID : undefined}
              onClick={() => toggle(id)}
              className="group flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:text-foreground"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-aria-pressed:bg-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
