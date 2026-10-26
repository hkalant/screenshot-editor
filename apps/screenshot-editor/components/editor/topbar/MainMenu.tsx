"use client";

import {
  ChevronLeft,
  Compass,
  Contrast,
  Copy,
  ImagePlus,
  ImageUp,
  Menu,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { runCopy } from "@/lib/export/controller";
import { canCopyImages } from "@/lib/export/exportImage";
import { useTheme } from "@/lib/hooks/useTheme";
import {
  selectActiveImage,
  selectHasSecondScreenshot,
  useEditorStore,
} from "@/lib/store/editor";
import { currentPlatform, isApplePlatform } from "@/lib/platform";
import { nextThemePreference, THEME_LABELS } from "@/lib/theme";
import { useTourStore } from "@/lib/tour/tour";
import { cn } from "@/lib/utils";
import { setShortcutsHandler } from "@/lib/shortcutsCommand";
import { itemClass, TutorialLinks } from "./HelpMenu";
import { ProjectItems } from "./ProjectItems";
import { KeyboardIcon, MenuShortcut, ShortcutList } from "./ShortcutList";

const subscribe = () => () => {};

type View = "menu" | "shortcuts";

/**
 * The menu at the start of the top bar, for everything secondary: projects,
 * copying, adding and replacing the screenshot, the keyboard shortcuts, the tour, the tutorials
 * and the theme.
 */
export function MainMenu({ onReplace }: { onReplace: () => void }) {
  const { preference, setPreference } = useTheme();
  const hasImage = useEditorStore((state) => !!selectActiveImage(state));
  // Replacing clears the annotations, and a second screenshot is one.
  const hasSecond = useEditorStore(selectHasSecondScreenshot);
  const loading = useEditorStore((state) => state.loading);
  const busy = useEditorStore((state) => state.loading || state.restoring);
  const canCopy = useSyncExternalStore(subscribe, canCopyImages, () => false);
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
          size="bar-icon"
          aria-label="Menu"
          data-tip="Menu"
          data-tour="menu"
          className="data-[state=open]:bg-accent"
        >
          <Menu aria-hidden />
        </Button>
      </PopoverTrigger>
      {view === "menu" ? (
        <PopoverContent align="start" className="w-80 p-2.5" aria-label="Menu">
          <ProjectItems
            onPick={() => setOpen(false)}
            shortcuts={
              apple
                ? { save: "⇧⌘S", open: "⇧⌘O" }
                : { save: "Ctrl+Shift+S", open: "Ctrl+Shift+O" }
            }
          />
          {canCopy && (
            <button
              type="button"
              className={cn(
                itemClass,
                "mt-0.5 disabled:pointer-events-none disabled:opacity-50",
              )}
              disabled={!hasImage || busy}
              onClick={() => {
                setOpen(false);
                // Straight from the click: the clipboard write must start in the gesture.
                runCopy();
              }}
            >
              <span className="flex w-5 justify-center text-muted-foreground">
                <Copy className="size-4" aria-hidden />
              </span>
              Copy image
              <MenuShortcut keys={apple ? "⌘C" : "Ctrl+C"} />
            </button>
          )}
          {/* Replace once there is a screenshot; until then, Add. */}
          <button
            type="button"
            className={cn(
              itemClass,
              "mt-0.5 disabled:pointer-events-none disabled:opacity-50",
            )}
            disabled={loading}
            aria-describedby="replace-hint"
            onClick={() => {
              setOpen(false);
              onReplace();
            }}
          >
            <span className="flex w-5 justify-center text-muted-foreground">
              {hasImage ? (
                <ImageUp className="size-4" aria-hidden />
              ) : (
                <ImagePlus className="size-4" aria-hidden />
              )}
            </span>
            {!hasImage
              ? "Add screenshot…"
              : hasSecond
                ? "Replace all screenshots…"
                : "Replace screenshot…"}
            <MenuShortcut keys={apple ? "⌘O" : "Ctrl+O"} />
          </button>
          {/* Pasting or dropping works too, which few would guess. */}
          <p
            id="replace-hint"
            className="pr-2.5 pb-1 pl-10.5 text-xs text-muted-foreground"
          >
            {!hasImage
              ? "Or paste or drop one onto the page."
              : hasSecond
                ? "Also clears the second screenshot and all annotations. Or paste or drop a new one onto the page."
                : "Or paste or drop a new one onto the page."}
          </p>
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
            <MenuShortcut keys={apple ? "⌘/" : "Ctrl+/"} />
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
          <div className="my-1 h-px bg-border" aria-hidden />
          {/* Stays open, so the theme can be cycled through in place. */}
          <button
            type="button"
            className={itemClass}
            onClick={() => setPreference(nextThemePreference(preference))}
          >
            <span className="flex w-5 justify-center text-muted-foreground">
              <Contrast className="size-4" aria-hidden />
            </span>
            Switch theme
            <span className="ml-auto text-xs text-muted-foreground">
              {THEME_LABELS[preference]}
            </span>
          </button>
        </PopoverContent>
      ) : (
        <PopoverContent
          align="start"
          className="w-96 p-3"
          aria-label="Keyboard shortcuts"
        >
          <div className="mb-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-1 size-7"
              aria-label="Back"
              data-tip="Back"
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
