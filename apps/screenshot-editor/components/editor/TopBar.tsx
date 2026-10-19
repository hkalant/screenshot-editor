"use client";

import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import { BrookesLogo } from "./BrookesLogo";
import { CopyButton } from "./topbar/CopyButton";
import { ExportMenu } from "./topbar/ExportMenu";
import { HistoryButtons } from "./topbar/HistoryButtons";
import { MoreMenu } from "./topbar/MoreMenu";
import { SizeMenu } from "./topbar/SizeMenu";
import { ThemeToggle } from "./topbar/ThemeToggle";

type Props = { onReplace: () => void };

/** The desktop top bar: the name on the left; the canvas size and history in
    the middle (centred from 1360px, where the bar has room); then secondary actions
    as icons, and Export, the main action, last. */
export function TopBar({ onReplace }: Props) {
  const image = useEditorStore(selectActiveImage);
  const loading = useEditorStore((state) => state.loading);

  return (
    <header
      data-pane="bar"
      className="relative z-20 flex h-14 shrink-0 items-center gap-2 rounded-xl glass px-3 lg:gap-3 lg:px-4"
    >
      <h1 className="flex shrink-0 items-center gap-3 font-semibold whitespace-nowrap">
        {/* The logo only where the bar has room for it. */}
        <BrookesLogo className="hidden h-8 w-auto text-(--obu-charcoal) lg:block dark:text-foreground" />
        <span className="hidden h-6 w-px bg-border lg:block" aria-hidden />
        Screenshot Editor
      </h1>
      <div
        className="mx-1 h-6 w-px bg-border min-[1360px]:hidden"
        aria-hidden
      />
      <div className="flex items-center gap-2 min-[1360px]:absolute min-[1360px]:left-1/2 min-[1360px]:-translate-x-1/2 lg:gap-3">
        <SizeMenu />
        <HistoryButtons />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        {image && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onReplace}
            disabled={loading}
            aria-label="Replace image"
            title="Replace image"
          >
            <ImageUp aria-hidden />
          </Button>
        )}
        <CopyButton />
        <ThemeToggle />
        <MoreMenu />
      </div>
      <div className="mx-1 h-6 w-px bg-border" aria-hidden />
      <ExportMenu />
    </header>
  );
}
