"use client";

import { ChevronLeft, Compass, Ellipsis } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { currentPlatform, isApplePlatform } from "@/lib/platform";
import { useTourStore } from "@/lib/tour/tour";
import { setShortcutsHandler } from "@/lib/shortcutsCommand";
import { itemClass, TutorialLinks } from "./HelpMenu";
import { ProjectItems } from "./ProjectItems";
import { KeyboardIcon, ShortcutList } from "./ShortcutList";

const subscribe = () => () => {};

type View = "menu" | "shortcuts";

/** The top bar's More button: projects, the keyboard shortcuts and the tutorials. */
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const apple = useSyncExternalStore(
    subscribe,
    () => isApplePlatform(currentPlatform()),
    () => false,
  );

  // ⌘/Ctrl + / opens the menu straight on the shortcuts, or closes it.
  useEffect(
    () =>
      setShortcutsHandler(() => {
        setView("shortcuts");
        setOpen((wasOpen) => !wasOpen);
      }),
    [],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setView("menu");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More"
          title="More"
          data-tour="more"
          className="data-[state=open]:bg-accent"
        >
          <Ellipsis aria-hidden />
        </Button>
      </PopoverTrigger>
      {view === "menu" ? (
        <PopoverContent align="end" className="w-80 p-2.5">
          <ProjectItems
            onPick={() => setOpen(false)}
            shortcuts={
              apple
                ? { save: "⇧⌘S", open: "⇧⌘O" }
                : { save: "Ctrl+Shift+S", open: "Ctrl+Shift+O" }
            }
          />
          <div className="my-1 h-px bg-border" aria-hidden />
          <button
            type="button"
            className={itemClass}
            onClick={() => setView("shortcuts")}
          >
            <span className="flex w-5 justify-center text-muted-foreground">
              <KeyboardIcon />
            </span>
            Keyboard shortcuts
            <kbd className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
              {apple ? "⌘/" : "Ctrl+/"}
            </kbd>
          </button>
          <div className="my-1 h-px bg-border" aria-hidden />
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              useTourStore.getState().open();
            }}
          >
            <span className="flex w-5 justify-center text-muted-foreground">
              <Compass className="size-4" aria-hidden />
            </span>
            Take the tour
          </button>
          <TutorialLinks onPick={() => setOpen(false)} />
        </PopoverContent>
      ) : (
        <PopoverContent align="end" className="w-96 p-3">
          <div className="mb-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-1 size-7"
              aria-label="Back"
              title="Back"
              onClick={() => setView("menu")}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          </div>
          <ShortcutList />
        </PopoverContent>
      )}
    </Popover>
  );
}
