"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import type { PanelId } from "@/lib/store/editor";
import { useEditorStore } from "@/lib/store/editor";
import { PANELS } from "./panels/registry";

/** The settings sidebar: a tool picker at the top and the chosen tool's panel (desktop layout). */
export function ToolRail() {
  const activePanel = useEditorStore((state) => state.activePanel);
  const setActivePanel = useEditorStore((state) => state.setActivePanel);
  const id = useId();
  const panel = PANELS.find((entry) => entry.id === activePanel) ?? PANELS[0];
  const { Component, icon: Icon } = panel;

  return (
    <aside
      data-pane="side"
      aria-label="Tools"
      className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl glass lg:w-80"
    >
      <div className="p-3 pb-0">
        <label htmlFor={id} className="sr-only">
          Tool
        </label>
        <div className="relative" data-tour="panel-picker">
          <Icon
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-foreground"
            aria-hidden
          />
          <select
            id={id}
            value={panel.id}
            onChange={(event) => setActivePanel(event.target.value as PanelId)}
            className="h-10 w-full appearance-none rounded-md border border-input bg-background/50 pr-10 pl-10 text-sm font-semibold text-foreground outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {PANELS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-foreground"
            aria-hidden
          />
        </div>
      </div>
      <section
        aria-label={panel.label}
        className="min-h-0 flex-1 overflow-y-auto p-5"
      >
        <Component />
      </section>
    </aside>
  );
}
