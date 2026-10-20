"use client";

import { ChevronDown } from "lucide-react";
import { Accordion } from "radix-ui";
import { type ReactNode, useEffect } from "react";
import { type SidebarSection, useSidebarStore } from "@/lib/store/sidebar";
import { BackgroundPanel } from "./panels/BackgroundPanel";
import { ResetStyleButton, STYLE_SECTIONS } from "./panels/StylePanel";

const SECTIONS: readonly {
  id: SidebarSection;
  title: string;
  Component: () => ReactNode;
}[] = [
  { id: "background", title: "Background", Component: BackgroundPanel },
  ...STYLE_SECTIONS,
];

/**
 * The settings sidebar (desktop layout): every setting in sections that
 * open and close, any number at once.
 */
export function ToolRail() {
  const open = useSidebarStore((state) => state.open);
  const setOpen = useSidebarStore((state) => state.setOpen);
  useEffect(() => useSidebarStore.getState().load(), []);

  return (
    <aside
      data-pane="side"
      aria-label="Settings"
      className="flex w-60 shrink-0 flex-col overflow-y-auto rounded-xl pane lg:w-80"
    >
      <Accordion.Root
        type="multiple"
        value={open}
        onValueChange={(value) => setOpen(value as SidebarSection[])}
      >
        {SECTIONS.map(({ id, title, Component }) => (
          <Accordion.Item
            key={id}
            value={id}
            data-tour={`section-${id}`}
            className="border-b"
          >
            <Accordion.Header asChild>
              <h2>
                <Accordion.Trigger className="group flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold tracking-wide uppercase outline-none hover:bg-accent/60 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring focus-visible:outline-solid">
                  {title}
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </Accordion.Trigger>
              </h2>
            </Accordion.Header>
            <Accordion.Content className="space-y-5 px-5 pt-3 pb-5">
              <Component />
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
      <div className="p-5">
        <ResetStyleButton />
      </div>
    </aside>
  );
}
