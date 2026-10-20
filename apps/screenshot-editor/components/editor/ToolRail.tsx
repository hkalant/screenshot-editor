"use client";

import { ChevronDown } from "lucide-react";
import { Accordion } from "radix-ui";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { type SidebarSection, useSidebarStore } from "@/lib/store/sidebar";
import { cn } from "@/lib/utils";
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
 * Whether a scrolling box has more below what it shows. Rechecked as it
 * scrolls and whenever it or its content changes size (a section opening).
 */
function useMoreBelow(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
) {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const box = scroller.current;
    const inner = content.current;
    if (!box || !inner) return;
    const check = () =>
      setMore(box.scrollHeight - box.scrollTop - box.clientHeight > 1);
    check();
    box.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(box);
    observer.observe(inner);
    return () => {
      box.removeEventListener("scroll", check);
      observer.disconnect();
    };
  }, [scroller, content]);
  return more;
}

/**
 * The settings sidebar (desktop layout): every setting in sections that
 * open and close, any number at once. It scrolls without a scrollbar; a
 * fade along the bottom shows when there is more below.
 */
export function ToolRail() {
  const open = useSidebarStore((state) => state.open);
  const setOpen = useSidebarStore((state) => state.setOpen);
  useEffect(() => useSidebarStore.getState().load(), []);
  const scroller = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const moreBelow = useMoreBelow(scroller, content);

  return (
    <aside
      ref={scroller}
      data-pane="side"
      aria-label="Settings"
      className="no-scrollbar flex w-60 shrink-0 flex-col overflow-y-auto rounded-xl pane lg:w-80"
    >
      <div ref={content}>
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
      </div>
      <div
        aria-hidden
        data-testid="sidebar-more"
        data-visible={moreBelow || undefined}
        className={cn(
          "pointer-events-none sticky bottom-0 -mt-12 h-12 shrink-0 bg-linear-to-t from-background to-transparent opacity-0 transition-opacity duration-200 motion-reduce:transition-none",
          moreBelow && "opacity-100",
        )}
      />
    </aside>
  );
}
