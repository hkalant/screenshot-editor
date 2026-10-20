"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Whether the group's highlight glides to the option under the mouse. */
const GlideContext = React.createContext(false);

const ITEM = '[data-slot="toggle-group-item"]';
/** How long the highlight's leading and trailing edges take, in ms. */
const LEAD_MS = 300;
const TRAIL_MS = 520;

/**
 * Segmented-control styling for a Radix toggle group. With `glide`, one
 * highlight slides to the option under the mouse, stretching as it goes,
 * and slides back to the chosen option when the mouse leaves.
 */
function ToggleGroup({
  className,
  glide = false,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & {
  glide?: boolean;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const pill = React.useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = React.useState<HTMLElement | null>(null);
  const last = React.useRef<{ left: number; right: number } | null>(null);

  const place = React.useCallback(
    (animate: boolean) => {
      const group = root.current;
      const highlight = pill.current;
      if (!group || !highlight) return;
      const items = Array.from(group.querySelectorAll<HTMLElement>(ITEM));
      const target =
        (hovered && group.contains(hovered) ? hovered : null) ??
        items.find((item) => item.dataset.state === "on") ??
        null;
      for (const item of items)
        item.toggleAttribute("data-highlight", item === target);
      if (!target) {
        highlight.style.opacity = "0";
        last.current = null;
        return;
      }
      const left = target.offsetLeft;
      const right = group.clientWidth - target.offsetLeft - target.offsetWidth;
      const before = last.current;
      // The edge in front leads and the one behind follows, so it stretches.
      const rightward = before ? left > before.left : true;
      const [leftMs, rightMs] = rightward
        ? [TRAIL_MS, LEAD_MS]
        : [LEAD_MS, TRAIL_MS];
      highlight.style.transitionDuration =
        animate && before ? `${leftMs}ms, ${rightMs}ms, 200ms` : "0ms";
      highlight.style.left = `${left}px`;
      highlight.style.right = `${right}px`;
      highlight.style.top = `${target.offsetTop}px`;
      highlight.style.height = `${target.offsetHeight}px`;
      highlight.style.opacity = "1";
      last.current = { left, right };
    },
    [hovered],
  );

  // After every render: the chosen option or the hovered one may have moved.
  React.useLayoutEffect(() => {
    if (glide) place(true);
  });

  // Without animating when the group is resized.
  React.useEffect(() => {
    const group = root.current;
    if (!glide || !group) return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(group);
    return () => observer.disconnect();
  }, [glide, place]);

  return (
    <ToggleGroupPrimitive.Root
      ref={root}
      data-slot="toggle-group"
      className={cn(
        "flex w-full items-center gap-0.5 rounded-md bg-muted/80 p-0.5",
        glide && "relative isolate",
        className,
      )}
      onPointerOver={
        glide
          ? (event) => {
              const item = (event.target as Element).closest<HTMLElement>(ITEM);
              if (item && !item.hasAttribute("data-disabled")) setHovered(item);
            }
          : undefined
      }
      onPointerLeave={glide ? () => setHovered(null) : undefined}
      {...props}
    >
      {glide && (
        <span
          ref={pill}
          aria-hidden
          className="pointer-events-none absolute -z-10 rounded-sm bg-selected opacity-0 sheen transition-[left,right,opacity] ease-[cubic-bezier(0.3,0.9,0.3,1)] motion-reduce:transition-none"
        />
      )}
      <GlideContext.Provider value={glide}>{children}</GlideContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const glide = React.useContext(GlideContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center justify-center rounded-sm px-1.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        // With glide, the highlight behind the items is the fill.
        glide
          ? "duration-300 data-highlight:text-selected-foreground"
          : "data-[state=on]:bg-selected data-[state=on]:text-selected-foreground data-[state=on]:sheen",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
